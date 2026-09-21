/**
 * PostgreSQL persistence for the projected legal-knowledge graph
 * (src/engine/graph). Stores edges only; nodes are resolved at read time
 * from LegalKnowledgeDocument/LegalKnowledgeArticle so this adapter never
 * becomes a second legal-knowledge store — see LegalKnowledgeGraphEdge's
 * doc comment in schema.prisma.
 */

import type {
  AsyncGraphRepository,
  GraphEdge,
  GraphEdgeType,
  GraphEdgeUpsertInput,
  GraphEdgeUpsertSummary,
  GraphNeighbor,
  GraphNode,
} from "@/engine/graph";
import { GraphNodeType, graphEdgeId, parseGraphNodeId } from "@/engine/graph";
import { getPrismaClient, type PrismaDbClient } from "@/infrastructure/database/prisma-client";

type GraphEdgeRow = {
  id: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  fromLabel: string;
  toLabel: string;
  evidence: string | null;
};

export class PrismaLegalGraphRepository implements AsyncGraphRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async upsertEdges(
    edges: readonly GraphEdgeUpsertInput[],
  ): Promise<GraphEdgeUpsertSummary> {
    if (edges.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const ids = edges.map((edge) =>
      graphEdgeId(edge.fromNodeId, edge.edgeType, edge.toNodeId),
    );
    const existing = await this.db.legalKnowledgeGraphEdge.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((row) => row.id));

    const operations = edges.map((edge) => {
      const id = graphEdgeId(edge.fromNodeId, edge.edgeType, edge.toNodeId);
      const data = {
        edgeType: edge.edgeType,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        fromDocumentId: edge.fromDocumentId ?? null,
        toDocumentId: edge.toDocumentId ?? null,
        fromLabel: edge.fromLabel,
        toLabel: edge.toLabel,
        sourceKind: edge.sourceKind,
        evidence: edge.evidence ?? null,
      };
      return this.db.legalKnowledgeGraphEdge.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    });

    await runBatched(this.db, operations);

    const inserted = ids.filter((id) => !existingIds.has(id)).length;
    return { inserted, updated: ids.length - inserted };
  }

  async findNode(id: string): Promise<GraphNode | null> {
    const parsed = parseGraphNodeId(id);
    if (parsed.kind === "document") {
      const document = await this.db.legalKnowledgeDocument.findUnique({
        where: { id: parsed.documentId },
        select: {
          id: true,
          title: true,
          documentType: true,
          jurisdiction: true,
          language: true,
        },
      });
      if (document) {
        return {
          id,
          type: inferDocumentNodeType(document.documentType),
          label: document.title,
          documentId: document.id,
          jurisdiction: document.jurisdiction,
          language: document.language,
          parentId: null,
        };
      }
    } else if (parsed.kind === "provision") {
      const article = await this.db.legalKnowledgeArticle.findFirst({
        where: { id: parsed.legalNodeId, documentId: parsed.documentId },
        select: { id: true, title: true, articleNumber: true, documentId: true },
      });
      if (article) {
        const parent = await this.db.legalKnowledgeDocument.findUnique({
          where: { id: article.documentId },
          select: { jurisdiction: true, language: true },
        });
        return {
          id,
          type: GraphNodeType.ARTICLE,
          label: article.title ?? article.articleNumber ?? article.id,
          documentId: article.documentId,
          jurisdiction: parent?.jurisdiction ?? null,
          language: parent?.language ?? null,
          parentId: `graph:doc:${article.documentId}`,
        };
      }
    }

    return this.findNodeFromEdgeLabel(id);
  }

  async outgoing(
    nodeId: string,
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphEdge[]> {
    const rows = await this.db.legalKnowledgeGraphEdge.findMany({
      where: {
        fromNodeId: nodeId,
        ...(edgeTypes ? { edgeType: { in: [...edgeTypes] } } : {}),
      },
    });
    return rows.map(toGraphEdge);
  }

  async incoming(
    nodeId: string,
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphEdge[]> {
    const rows = await this.db.legalKnowledgeGraphEdge.findMany({
      where: {
        toNodeId: nodeId,
        ...(edgeTypes ? { edgeType: { in: [...edgeTypes] } } : {}),
      },
    });
    return rows.map(toGraphEdge);
  }

  async outgoingForMany(
    nodeIds: readonly string[],
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphEdge[]> {
    if (nodeIds.length === 0) {
      return [];
    }
    const rows = await this.db.legalKnowledgeGraphEdge.findMany({
      where: {
        fromNodeId: { in: [...new Set(nodeIds)] },
        ...(edgeTypes ? { edgeType: { in: [...edgeTypes] } } : {}),
      },
    });
    return rows.map(toGraphEdge);
  }

  async neighbors(
    nodeId: string,
    options: { direction?: "OUT" | "IN" | "BOTH"; edgeTypes?: readonly GraphEdgeType[] } = {},
  ): Promise<GraphNeighbor[]> {
    const direction = options.direction ?? "BOTH";
    const edgeTypeFilter = options.edgeTypes ? { edgeType: { in: [...options.edgeTypes] } } : {};

    const [outRows, inRows] = await Promise.all([
      direction === "OUT" || direction === "BOTH"
        ? this.db.legalKnowledgeGraphEdge.findMany({
            where: { fromNodeId: nodeId, ...edgeTypeFilter },
          })
        : Promise.resolve([] as GraphEdgeRow[]),
      direction === "IN" || direction === "BOTH"
        ? this.db.legalKnowledgeGraphEdge.findMany({
            where: { toNodeId: nodeId, ...edgeTypeFilter },
          })
        : Promise.resolve([] as GraphEdgeRow[]),
    ]);

    const otherSideIds = [
      ...outRows.map((row) => row.toNodeId),
      ...inRows.map((row) => row.fromNodeId),
    ];
    const nodesById = await this.resolveNodesBatch(otherSideIds, [...outRows, ...inRows]);

    const result: GraphNeighbor[] = [];
    for (const row of outRows) {
      const node = nodesById.get(row.toNodeId);
      if (node) {
        result.push({ node, edge: toGraphEdge(row), direction: "OUT" });
      }
    }
    for (const row of inRows) {
      const node = nodesById.get(row.fromNodeId);
      if (node) {
        result.push({ node, edge: toGraphEdge(row), direction: "IN" });
      }
    }
    return result;
  }

  /**
   * Resolves every node in `ids` with at most two batched queries (one for
   * document-shaped ids, one for provision-shaped ids), never one query
   * per id. `edgeRows` supplies the fallback label for any id that has no
   * backing document/article row yet (a forward reference), since the
   * edge itself already carries fromLabel/toLabel — no third query needed.
   */
  private async resolveNodesBatch(
    ids: readonly string[],
    edgeRows: readonly GraphEdgeRow[],
  ): Promise<Map<string, GraphNode>> {
    const unique = [...new Set(ids)];
    const documentIds: string[] = [];
    const provisionsByDoc = new Map<string, string[]>();
    const parsedById = new Map<string, ReturnType<typeof parseGraphNodeId>>();

    for (const id of unique) {
      const parsed = parseGraphNodeId(id);
      parsedById.set(id, parsed);
      if (parsed.kind === "document") {
        documentIds.push(parsed.documentId);
      } else if (parsed.kind === "provision") {
        const bucket = provisionsByDoc.get(parsed.documentId) ?? [];
        bucket.push(parsed.legalNodeId);
        provisionsByDoc.set(parsed.documentId, bucket);
      }
    }

    const provisionDocIds = [...provisionsByDoc.keys()];
    const provisionArticleIds = [...provisionsByDoc.values()].flat();

    const [documents, articles] = await Promise.all([
      documentIds.length > 0
        ? this.db.legalKnowledgeDocument.findMany({
            where: { id: { in: [...new Set([...documentIds, ...provisionDocIds])] } },
            select: { id: true, title: true, documentType: true, jurisdiction: true, language: true },
          })
        : provisionDocIds.length > 0
          ? this.db.legalKnowledgeDocument.findMany({
              where: { id: { in: provisionDocIds } },
              select: { id: true, title: true, documentType: true, jurisdiction: true, language: true },
            })
          : Promise.resolve([]),
      provisionArticleIds.length > 0
        ? this.db.legalKnowledgeArticle.findMany({
            where: { id: { in: provisionArticleIds } },
            select: { id: true, title: true, articleNumber: true, documentId: true },
          })
        : Promise.resolve([]),
    ]);

    const documentsById = new Map(documents.map((doc) => [doc.id, doc]));
    const articlesById = new Map(articles.map((article) => [article.id, article]));

    const result = new Map<string, GraphNode>();
    for (const id of unique) {
      const parsed = parsedById.get(id)!;
      if (parsed.kind === "document") {
        const document = documentsById.get(parsed.documentId);
        if (document) {
          result.set(id, {
            id,
            type: inferDocumentNodeType(document.documentType),
            label: document.title,
            documentId: document.id,
            jurisdiction: document.jurisdiction,
            language: document.language,
            parentId: null,
          });
          continue;
        }
      } else if (parsed.kind === "provision") {
        const article = articlesById.get(parsed.legalNodeId);
        const document = documentsById.get(parsed.documentId);
        if (article) {
          result.set(id, {
            id,
            type: GraphNodeType.ARTICLE,
            label: article.title ?? article.articleNumber ?? article.id,
            documentId: article.documentId,
            jurisdiction: document?.jurisdiction ?? null,
            language: document?.language ?? null,
            parentId: `graph:doc:${article.documentId}`,
          });
          continue;
        }
      }

      const label = fallbackLabelFromEdges(id, edgeRows);
      if (label) {
        result.set(id, {
          id,
          type: GraphNodeType.AUTHORITY,
          label,
          documentId: null,
          jurisdiction: null,
          language: null,
          parentId: null,
        });
      }
    }
    return result;
  }

  private async findNodeFromEdgeLabel(id: string): Promise<GraphNode | null> {
    const edge = await this.db.legalKnowledgeGraphEdge.findFirst({
      where: { OR: [{ fromNodeId: id }, { toNodeId: id }] },
      select: { fromNodeId: true, toNodeId: true, fromLabel: true, toLabel: true },
    });
    if (!edge) {
      return null;
    }
    const label = edge.fromNodeId === id ? edge.fromLabel : edge.toLabel;
    return {
      id,
      type: GraphNodeType.AUTHORITY,
      label,
      documentId: null,
      jurisdiction: null,
      language: null,
      parentId: null,
    };
  }
}

function toGraphEdge(row: GraphEdgeRow): GraphEdge {
  return {
    id: row.id,
    type: row.edgeType as GraphEdgeType,
    fromId: row.fromNodeId,
    toId: row.toNodeId,
    evidence: row.evidence ? [row.evidence] : [],
  };
}

function fallbackLabelFromEdges(
  id: string,
  edgeRows: readonly GraphEdgeRow[],
): string | null {
  for (const row of edgeRows) {
    if (row.fromNodeId === id) {
      return row.fromLabel;
    }
    if (row.toNodeId === id) {
      return row.toLabel;
    }
  }
  return null;
}

/**
 * Best-effort only — documentType is a keyword-inferred subject-matter
 * tag (see RuleBasedKnowledgeMetadataExtractor), not a persisted
 * instrument-type classification. Reuses the same substring convention
 * prisma-legal-knowledge-repository.ts already relies on elsewhere rather
 * than inventing a new one. Falls back to AUTHORITY, never guesses.
 */
function inferDocumentNodeType(documentType: string | null): GraphNodeType {
  if (!documentType) {
    return GraphNodeType.AUTHORITY;
  }
  const upper = documentType.toUpperCase();
  if (upper.includes("REGULATION")) {
    return GraphNodeType.GOVERNMENT_REGULATION;
  }
  if (upper.includes("DECISION") || upper.includes("JUDGMENT")) {
    return GraphNodeType.COURT_DECISION;
  }
  if (upper.includes("COMMENTARY") || upper.includes("DOCTRINE")) {
    return GraphNodeType.LEGAL_COMMENTARY;
  }
  if (upper.includes("GUIDELINE")) {
    return GraphNodeType.PROSECUTOR_GUIDELINE;
  }
  return GraphNodeType.LAW;
}

/**
 * Runs all operations in one round trip when `db` supports $transaction
 * (a full PrismaClient); falls back to Promise.all when `db` is already a
 * Prisma.TransactionClient handed down by a caller (which has no
 * $transaction of its own — nested transactions are not a Prisma
 * concept), so the caller's existing transaction boundary is respected
 * rather than silently ignored.
 */
async function runBatched(
  db: PrismaDbClient,
  operations: readonly PromiseLike<unknown>[],
): Promise<void> {
  if ("$transaction" in db && typeof db.$transaction === "function") {
    await db.$transaction(operations as never);
    return;
  }
  await Promise.all(operations);
}

/**
 * Not wired into any route, use-case, or the live Legal AI answer path
 * yet (Phase 5 of the graph foundation work) — exported for the
 * projection service and tests to construct against.
 */
export const legalGraphRepository = new PrismaLegalGraphRepository();
