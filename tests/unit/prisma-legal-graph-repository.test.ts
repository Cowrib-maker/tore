/**
 * Unit tests for the Prisma-backed legal knowledge graph persistence
 * adapter. Uses an in-memory fake Prisma surface (no live Neon in unit
 * tests), matching the convention in engine-legal-persistence.test.ts.
 */

import { describe, expect, it } from "vitest";

import { GraphEdgeType, GraphNodeType, documentGraphId, provisionGraphId } from "@/engine/graph";
import { PrismaLegalGraphRepository } from "@/infrastructure/repositories/prisma-legal-graph-repository";

type EdgeRow = {
  id: string;
  edgeType: string;
  fromNodeId: string;
  toNodeId: string;
  fromDocumentId: string | null;
  toDocumentId: string | null;
  fromLabel: string;
  toLabel: string;
  sourceKind: string;
  evidence: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentRow = {
  id: string;
  title: string;
  documentType: string | null;
  jurisdiction: string;
  language: string;
};

type ArticleRow = {
  id: string;
  documentId: string;
  title: string | null;
  articleNumber: string | null;
};

type InList = { in?: string[] };
type Select = Record<string, boolean>;
type EdgeWhere = { id?: InList; fromNodeId?: InList | string; toNodeId?: InList | string; edgeType?: InList; OR?: { fromNodeId?: string; toNodeId?: string }[] };
type IdWhere = { id?: InList | string; documentId?: string };
/** The arguments the fake reads; the real Prisma types are intentionally not imported into unit tests. */
type FakeQuery<W> = { where?: W; select?: Select };
type PrismaDbClient = ConstructorParameters<typeof PrismaLegalGraphRepository>[0];
/** The fake implements only the surface the repository reads, so it is cast once, here. */
const repoOver = (fake: object) => new PrismaLegalGraphRepository(fake as unknown as PrismaDbClient);

/** Lazily-executed, thenable "prepared operation" mirroring PrismaPromise:
 * nothing mutates until it is awaited (individually, or via $transaction). */
function pendingOp<T>(run: () => T) {
  return {
    then(resolve: (value: T) => void, reject: (error: unknown) => void) {
      try {
        resolve(run());
      } catch (error) {
        reject(error);
      }
    },
  };
}

function pick<T extends object>(row: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) return row;
  const out: Partial<T> = {};
  for (const key of Object.keys(select) as (keyof T)[]) {
    if (select[key as string]) out[key] = row[key];
  }
  return out;
}

function createFakeGraphPrisma(options: { failTransaction?: boolean; asTransactionClient?: boolean } = {}) {
  const edges = new Map<string, EdgeRow>();
  const documents = new Map<string, DocumentRow>();
  const articles = new Map<string, ArticleRow>();

  const base = {
    legalKnowledgeGraphEdge: {
      findMany: async ({ where, select }: FakeQuery<EdgeWhere>) => {
        let rows = [...edges.values()];
        const inList = (v: InList | string | undefined) => (typeof v === "object" ? v.in : undefined);
        const ids = inList(where?.id);
        if (ids) rows = rows.filter((r) => ids.includes(r.id));
        const fromIn = inList(where?.fromNodeId);
        if (fromIn) rows = rows.filter((r) => fromIn.includes(r.fromNodeId));
        else if (typeof where?.fromNodeId === "string") rows = rows.filter((r) => r.fromNodeId === where.fromNodeId);
        const toIn = inList(where?.toNodeId);
        if (toIn) rows = rows.filter((r) => toIn.includes(r.toNodeId));
        else if (typeof where?.toNodeId === "string") rows = rows.filter((r) => r.toNodeId === where.toNodeId);
        const types = inList(where?.edgeType);
        if (types) rows = rows.filter((r) => types.includes(r.edgeType));
        return rows.map((r) => pick(r, select));
      },
      findFirst: async ({ where, select }: FakeQuery<EdgeWhere>) => {
        const rows = [...edges.values()].filter((r) =>
          (where?.OR ?? []).some(
            (cond) =>
              (cond.fromNodeId && r.fromNodeId === cond.fromNodeId) ||
              (cond.toNodeId && r.toNodeId === cond.toNodeId),
          ),
        );
        return rows[0] ? pick(rows[0], select) : null;
      },
      upsert: ({ where, create, update }: { where: { id: string }; create: EdgeRow; update: Partial<EdgeRow> }) =>
        pendingOp(() => {
          const existing = edges.get(where.id);
          const row: EdgeRow = existing
            ? { ...existing, ...update, updatedAt: new Date() }
            : { ...create, createdAt: new Date(), updatedAt: new Date() };
          edges.set(where.id, row);
          return row;
        }),
    },
    legalKnowledgeDocument: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Select }) => {
        const doc = documents.get(where.id);
        return doc ? pick(doc, select) : null;
      },
      findMany: async ({ where, select }: FakeQuery<IdWhere>) => {
        let rows = [...documents.values()];
        const ids = typeof where?.id === "object" ? where.id.in : undefined;
        if (ids) rows = rows.filter((r) => ids.includes(r.id));
        return rows.map((r) => pick(r, select));
      },
    },
    legalKnowledgeArticle: {
      findFirst: async ({ where, select }: FakeQuery<IdWhere>) => {
        let rows = [...articles.values()];
        if (typeof where?.id === "string") rows = rows.filter((r) => r.id === where.id);
        if (where?.documentId) rows = rows.filter((r) => r.documentId === where.documentId);
        return rows[0] ? pick(rows[0], select) : null;
      },
      findMany: async ({ where, select }: FakeQuery<IdWhere>) => {
        let rows = [...articles.values()];
        const ids = typeof where?.id === "object" ? where.id.in : undefined;
        if (ids) rows = rows.filter((r) => ids.includes(r.id));
        return rows.map((r) => pick(r, select));
      },
    },
  };

  const db = options.asTransactionClient
    ? base
    : {
        ...base,
        $transaction: async (ops: readonly PromiseLike<unknown>[]) => {
          if (options.failTransaction) {
            throw new Error("simulated transaction failure");
          }
          return Promise.all(ops);
        },
      };

  return { db, edges, documents, articles };
}

describe("PrismaLegalGraphRepository", () => {
  it("persists an edge and resolves both endpoint nodes from existing document/article rows", async () => {
    const { db, documents, articles } = createFakeGraphPrisma();
    documents.set("doc-1", { id: "doc-1", title: "Иргэний хууль", documentType: "LAW", jurisdiction: "MN", language: "mn" });
    articles.set("art-1", { id: "art-1", documentId: "doc-1", title: "Зүйл 17", articleNumber: "17" });
    const repo = repoOver(db);

    const fromId = documentGraphId("doc-1");
    const toId = provisionGraphId("doc-1", "art-1");
    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.CONTAINS,
        fromNodeId: fromId,
        toNodeId: toId,
        fromDocumentId: "doc-1",
        toDocumentId: "doc-1",
        fromLabel: "Иргэний хууль",
        toLabel: "Зүйл 17",
        sourceKind: "DOCUMENT_STRUCTURE",
      },
    ]);

    const fromNode = await repo.findNode(fromId);
    const toNode = await repo.findNode(toId);
    expect(fromNode).toMatchObject({ type: GraphNodeType.LAW, label: "Иргэний хууль" });
    expect(toNode).toMatchObject({ type: GraphNodeType.ARTICLE, label: "Зүйл 17", parentId: fromId });
  });

  it("falls back to a synthesized AUTHORITY node using the edge's stored label when the target document was never ingested", async () => {
    const { db } = createFakeGraphPrisma();
    const repo = repoOver(db);
    const fromId = documentGraphId("doc-1");
    const forwardRefId = "graph:ext:LEGALINFO_LAW_ID:999999";

    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.CITES,
        fromNodeId: fromId,
        toNodeId: forwardRefId,
        fromLabel: "Иргэний хууль",
        toLabel: "LegalInfo law 999999",
        sourceKind: "LEGALINFO_CROSS_REFERENCE",
      },
    ]);

    const node = await repo.findNode(forwardRefId);
    expect(node).toMatchObject({ type: GraphNodeType.AUTHORITY, label: "LegalInfo law 999999" });
  });

  it("is idempotent: re-applying the same edge upserts in place rather than duplicating", async () => {
    const { db, edges } = createFakeGraphPrisma();
    const repo = repoOver(db);
    const input = {
      edgeType: GraphEdgeType.CITES,
      fromNodeId: documentGraphId("doc-1"),
      toNodeId: documentGraphId("doc-2"),
      fromLabel: "Law A",
      toLabel: "Law B",
      sourceKind: "LEGALINFO_CROSS_REFERENCE",
      evidence: "first evidence",
    };

    const first = await repo.upsertEdges([input]);
    expect(first).toEqual({ inserted: 1, updated: 0 });
    expect(edges.size).toBe(1);

    const second = await repo.upsertEdges([{ ...input, evidence: "updated evidence" }]);
    expect(second).toEqual({ inserted: 0, updated: 1 });
    expect(edges.size).toBe(1);

    const [edge] = await repo.outgoing(input.fromNodeId);
    expect(edge.evidence).toEqual(["updated evidence"]);
  });

  it("prevents duplicate edges: two distinct upsertEdges calls for the same (from, type, to) never produce two rows", async () => {
    const { db, edges } = createFakeGraphPrisma();
    const repo = repoOver(db);
    const edge = {
      edgeType: GraphEdgeType.AMENDS,
      fromNodeId: documentGraphId("doc-1"),
      toNodeId: documentGraphId("doc-2"),
      fromLabel: "Law A",
      toLabel: "Law B",
      sourceKind: "DOCUMENT_STRUCTURE",
    };
    await repo.upsertEdges([edge]);
    await repo.upsertEdges([edge]);
    await repo.upsertEdges([edge]);
    expect(edges.size).toBe(1);
  });

  it("round-trips provenance fields (sourceKind, evidence, fromDocumentId/toDocumentId)", async () => {
    const { db } = createFakeGraphPrisma();
    const repo = repoOver(db);
    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.CITES,
        fromNodeId: documentGraphId("doc-1"),
        toNodeId: documentGraphId("doc-2"),
        fromDocumentId: "doc-1",
        toDocumentId: "doc-2",
        fromLabel: "Law A",
        toLabel: "Law B",
        sourceKind: "LEGALINFO_CROSS_REFERENCE",
        evidence: "href=/mn/detail?lawId=2",
      },
    ]);
    const [edge] = await repo.outgoing(documentGraphId("doc-1"));
    expect(edge.evidence).toEqual(["href=/mn/detail?lawId=2"]);
    expect(edge.type).toBe(GraphEdgeType.CITES);
  });

  it("supports outgoing/incoming/neighbors traversal with edge-type filtering", async () => {
    const { db, documents } = createFakeGraphPrisma();
    documents.set("doc-1", { id: "doc-1", title: "Law A", documentType: "LAW", jurisdiction: "MN", language: "mn" });
    documents.set("doc-2", { id: "doc-2", title: "Law B", documentType: "LAW", jurisdiction: "MN", language: "mn" });
    const repo = repoOver(db);
    const a = documentGraphId("doc-1");
    const b = documentGraphId("doc-2");

    await repo.upsertEdges([
      { edgeType: GraphEdgeType.CITES, fromNodeId: a, toNodeId: b, fromLabel: "Law A", toLabel: "Law B", sourceKind: "LEGALINFO_CROSS_REFERENCE" },
      { edgeType: GraphEdgeType.AMENDS, fromNodeId: a, toNodeId: b, fromLabel: "Law A", toLabel: "Law B", sourceKind: "DOCUMENT_STRUCTURE" },
    ]);

    const outAll = await repo.outgoing(a);
    expect(outAll).toHaveLength(2);
    const outCitesOnly = await repo.outgoing(a, [GraphEdgeType.CITES]);
    expect(outCitesOnly).toHaveLength(1);
    expect(outCitesOnly[0]!.type).toBe(GraphEdgeType.CITES);

    const incoming = await repo.incoming(b);
    expect(incoming).toHaveLength(2);

    const neighbors = await repo.neighbors(a, { direction: "OUT" });
    expect(neighbors).toHaveLength(2);
    expect(neighbors[0]!.node.label).toBe("Law B");
    expect(neighbors[0]!.direction).toBe("OUT");
  });

  it("resolves neighbor nodes with at most two batched document/article queries, not one query per edge (no N+1)", async () => {
    const { db, documents } = createFakeGraphPrisma();
    let documentFindManyCalls = 0;
    documents.set("doc-1", { id: "doc-1", title: "Hub law", documentType: "LAW", jurisdiction: "MN", language: "mn" });
    for (let i = 2; i <= 6; i += 1) {
      documents.set(`doc-${i}`, { id: `doc-${i}`, title: `Law ${i}`, documentType: "LAW", jurisdiction: "MN", language: "mn" });
    }
    const originalFindMany = db.legalKnowledgeDocument.findMany.bind(db.legalKnowledgeDocument);
    db.legalKnowledgeDocument.findMany = async (...args: Parameters<typeof originalFindMany>) => {
      documentFindManyCalls += 1;
      return originalFindMany(...args);
    };

    const repo = repoOver(db);
    const hub = documentGraphId("doc-1");
    await repo.upsertEdges(
      [2, 3, 4, 5, 6].map((i) => ({
        edgeType: GraphEdgeType.CITES,
        fromNodeId: hub,
        toNodeId: documentGraphId(`doc-${i}`),
        fromLabel: "Hub law",
        toLabel: `Law ${i}`,
        sourceKind: "LEGALINFO_CROSS_REFERENCE",
      })),
    );

    const neighbors = await repo.neighbors(hub, { direction: "OUT" });
    expect(neighbors).toHaveLength(5);
    expect(documentFindManyCalls).toBe(1);
  });

  it("rolls back the whole batch on transaction failure — no partial edges persist", async () => {
    const { db, edges } = createFakeGraphPrisma({ failTransaction: true });
    const repo = repoOver(db);

    await expect(
      repo.upsertEdges([
        { edgeType: GraphEdgeType.CITES, fromNodeId: documentGraphId("doc-1"), toNodeId: documentGraphId("doc-2"), fromLabel: "A", toLabel: "B", sourceKind: "LEGALINFO_CROSS_REFERENCE" },
        { edgeType: GraphEdgeType.CITES, fromNodeId: documentGraphId("doc-1"), toNodeId: documentGraphId("doc-3"), fromLabel: "A", toLabel: "C", sourceKind: "LEGALINFO_CROSS_REFERENCE" },
      ]),
    ).rejects.toThrow("simulated transaction failure");

    expect(edges.size).toBe(0);
  });

  it("falls back to Promise.all (no double-nested transaction) when given an already-scoped transaction client", async () => {
    const { db, edges } = createFakeGraphPrisma({ asTransactionClient: true });
    const repo = repoOver(db);
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.CITES, fromNodeId: documentGraphId("doc-1"), toNodeId: documentGraphId("doc-2"), fromLabel: "A", toLabel: "B", sourceKind: "LEGALINFO_CROSS_REFERENCE" },
    ]);
    expect(edges.size).toBe(1);
  });

  it("uses the documentType heuristic (matching prisma-legal-knowledge-repository.ts's convention) to infer node type, falling back to AUTHORITY", async () => {
    const { db, documents } = createFakeGraphPrisma();
    documents.set("reg-1", { id: "reg-1", title: "Regulation", documentType: "GOVERNMENT_REGULATION", jurisdiction: "MN", language: "mn" });
    documents.set("court-1", { id: "court-1", title: "Decision", documentType: "COURT_DECISION", jurisdiction: "MN", language: "mn" });
    documents.set("unknown-1", { id: "unknown-1", title: "Unknown", documentType: null, jurisdiction: "MN", language: "mn" });
    const repo = repoOver(db);

    expect((await repo.findNode(documentGraphId("reg-1")))?.type).toBe(GraphNodeType.GOVERNMENT_REGULATION);
    expect((await repo.findNode(documentGraphId("court-1")))?.type).toBe(GraphNodeType.COURT_DECISION);
    expect((await repo.findNode(documentGraphId("unknown-1")))?.type).toBe(GraphNodeType.AUTHORITY);
  });

  it("outgoingForMany fetches edges from several nodes in a single batched query", async () => {
    const { db, edges } = createFakeGraphPrisma();
    let edgeFindManyCalls = 0;
    const originalFindMany = db.legalKnowledgeGraphEdge.findMany.bind(db.legalKnowledgeGraphEdge);
    db.legalKnowledgeGraphEdge.findMany = async (...args: Parameters<typeof originalFindMany>) => {
      edgeFindManyCalls += 1;
      return originalFindMany(...args);
    };
    const repo = repoOver(db);
    const a = documentGraphId("doc-a");
    const b = documentGraphId("doc-b");
    const c = documentGraphId("doc-c");

    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: a, toNodeId: c, fromLabel: "A", toLabel: "C", sourceKind: "DOCUMENT_STRUCTURE" },
      { edgeType: GraphEdgeType.CITES, fromNodeId: b, toNodeId: c, fromLabel: "B", toLabel: "C", sourceKind: "LEGALINFO_CROSS_REFERENCE" },
    ]);
    edgeFindManyCalls = 0;

    const result = await repo.outgoingForMany([a, b], [GraphEdgeType.REPEALS, GraphEdgeType.CITES]);
    expect(result).toHaveLength(2);
    expect(edgeFindManyCalls).toBe(1);
    expect(edges.size).toBe(2);
  });

  it("returns null for a node id that resolves to neither a document/article row nor any edge label", async () => {
    const { db } = createFakeGraphPrisma();
    const repo = repoOver(db);
    expect(await repo.findNode(documentGraphId("never-ingested"))).toBeNull();
  });
});
