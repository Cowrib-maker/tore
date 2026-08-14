import type { CitationEntry, CitationIndex } from "../citation/types";
import { normalizeCitation } from "../citation/normalize";
import { parseDottedPinpoint } from "../citation/pinpoint";
import { documentGraphId, provisionGraphId } from "../graph/ids";
import { GraphNodeType } from "../graph/types";
import type { LegalDocument, LegalNode } from "../knowledge/schema";
import { RetrievalStrategyId, type IRetrievalStrategy, type RetrievalHit, type RetrievalRequest } from "./types";

export function asIndexes(
  index: CitationIndex | readonly CitationIndex[],
): readonly CitationIndex[] {
  if (isCitationIndexArray(index)) {
    return [...index];
  }
  return [index];
}

function isCitationIndexArray(
  index: CitationIndex | readonly CitationIndex[],
): index is readonly CitationIndex[] {
  return Array.isArray(index);
}

export function defaultRetrievalStrategies(): IRetrievalStrategy[] {
  return [
    new ExactCitationStrategy(),
    new ExactProvisionStrategy(),
    new GraphNeighborStrategy(),
    new RelatedAuthorityStrategy(),
    new RelatedCaseStrategy(),
    new RelatedGuidelineStrategy(),
    new RelatedLegislationStrategy(),
  ];
}

export class ExactCitationStrategy implements IRetrievalStrategy {
  readonly id = RetrievalStrategyId.EXACT_CITATION;

  execute(request: RetrievalRequest): RetrievalHit[] {
    const indexes = asIndexes(request.citationIndex);
    const hits: RetrievalHit[] = [];
    for (const citation of request.citations) {
      const entry = resolveCitation(indexes, citation.query, citation.nodeId);
      if (!entry) {
        continue;
      }
      hits.push({
        id: entry.nodeId,
        kind: citation.kind ?? entry.kind,
        label: entry.canonical,
        documentId: citation.documentId ?? entry.documentId,
        source: "citation",
        strategy: this.id,
        score: 1,
      });
    }
    return hits;
  }
}

export class ExactProvisionStrategy implements IRetrievalStrategy {
  readonly id = RetrievalStrategyId.EXACT_PROVISION;

  execute(request: RetrievalRequest): RetrievalHit[] {
    const indexes = asIndexes(request.citationIndex);
    const queries = provisionQueries(request);
    const hits: RetrievalHit[] = [];
    for (const query of queries) {
      const entry = resolveCitation(indexes, query, null);
      if (entry) {
        hits.push({
          id: entry.nodeId,
          kind: entry.kind,
          label: entry.canonical,
          documentId: entry.documentId,
          source: "provision",
          strategy: this.id,
          score: 0.9,
        });
        continue;
      }
      for (const match of matchDocumentNodes(request.documents, query)) {
        hits.push({
          id: match.node.id,
          kind: match.node.kind,
          label: match.node.locator?.display ?? match.node.heading ?? query,
          documentId: match.document.identity.id,
          source: "provision",
          strategy: this.id,
          score: 0.85,
        });
      }
    }
    return hits;
  }
}

export class GraphNeighborStrategy implements IRetrievalStrategy {
  readonly id = RetrievalStrategyId.GRAPH_NEIGHBOR;

  execute(request: RetrievalRequest): RetrievalHit[] {
    const hits: RetrievalHit[] = [];
    for (const seed of graphSeeds(request)) {
      for (const neighbor of request.graph.neighbors(seed)) {
        hits.push({
          id: neighbor.node.id,
          kind: neighbor.node.type,
          label: neighbor.node.label,
          documentId: neighbor.node.documentId,
          source: "graph",
          strategy: this.id,
          score: 0.7,
          edgeType: neighbor.edge.type,
          direction: neighbor.direction,
        });
      }
    }
    return hits;
  }
}

export class RelatedAuthorityStrategy implements IRetrievalStrategy {
  readonly id = RetrievalStrategyId.RELATED_AUTHORITY;

  execute(request: RetrievalRequest): RetrievalHit[] {
    const hits: RetrievalHit[] = [];
    for (const seed of graphSeeds(request)) {
      for (const node of request.graph.findRelated(seed)) {
        hits.push({
          id: node.id,
          kind: node.type,
          label: node.label,
          documentId: node.documentId,
          source: "graph",
          strategy: this.id,
          score: 0.6,
        });
      }
    }
    return hits;
  }
}

export class RelatedCaseStrategy implements IRetrievalStrategy {
  readonly id = RetrievalStrategyId.RELATED_CASE;

  execute(request: RetrievalRequest): RetrievalHit[] {
    return typeHits(request, this.id, [
      GraphNodeType.COURT_DECISION,
      GraphNodeType.SUPREME_COURT_RESOLUTION,
    ]);
  }
}

export class RelatedGuidelineStrategy implements IRetrievalStrategy {
  readonly id = RetrievalStrategyId.RELATED_GUIDELINE;

  execute(request: RetrievalRequest): RetrievalHit[] {
    return typeHits(request, this.id, [GraphNodeType.PROSECUTOR_GUIDELINE]);
  }
}

export class RelatedLegislationStrategy implements IRetrievalStrategy {
  readonly id = RetrievalStrategyId.RELATED_LEGISLATION;

  execute(request: RetrievalRequest): RetrievalHit[] {
    return typeHits(request, this.id, [
      GraphNodeType.LAW,
      GraphNodeType.GOVERNMENT_REGULATION,
    ]);
  }
}

function typeHits(
  request: RetrievalRequest,
  strategy: RetrievalStrategyId,
  types: readonly (typeof GraphNodeType)[keyof typeof GraphNodeType][],
): RetrievalHit[] {
  const hits: RetrievalHit[] = [];
  for (const type of types) {
    for (const node of request.graph.findByType(type)) {
      hits.push({
        id: node.id,
        kind: node.type,
        label: node.label,
        documentId: node.documentId,
        source: "graph",
        strategy,
        score: 0.45,
      });
    }
  }
  return hits;
}

function resolveCitation(
  indexes: readonly CitationIndex[],
  query: string,
  nodeId: string | null,
): CitationEntry | null {
  const key = normalizeCitation(query);
  for (const index of indexes) {
    for (const entry of index.entries) {
      if (nodeId && entry.nodeId === nodeId) {
        return entry;
      }
      if (normalizeCitation(entry.canonical) === key) {
        return entry;
      }
      if (entry.aliases.some((alias) => normalizeCitation(alias) === key)) {
        return entry;
      }
    }
  }
  return null;
}

function provisionQueries(request: RetrievalRequest): string[] {
  const queries = new Set<string>();
  const question = request.question.trim();
  if (question) {
    queries.add(question);
    const dotted = question.match(/\d+(?:\.\d+){0,3}/g) ?? [];
    for (const token of dotted) {
      if (parseDottedPinpoint(token)) {
        queries.add(token);
      }
    }
  }
  for (const citation of request.citations) {
    queries.add(citation.query);
    if (citation.canonical) {
      queries.add(citation.canonical);
    }
  }
  return [...queries];
}

function matchDocumentNodes(
  documents: readonly LegalDocument[],
  query: string,
): { document: LegalDocument; node: LegalNode }[] {
  const key = normalizeCitation(query);
  const matches: { document: LegalDocument; node: LegalNode }[] = [];
  for (const document of documents) {
    walk(document.hierarchy, (node) => {
      const display = node.locator?.display ?? "";
      const heading = node.heading ?? "";
      if (
        normalizeCitation(display) === key ||
        normalizeCitation(heading) === key
      ) {
        matches.push({ document, node });
      }
    });
  }
  return matches;
}

function walk(nodes: LegalNode[], visit: (node: LegalNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function graphSeeds(request: RetrievalRequest): string[] {
  const seeds = new Set<string>();
  for (const citation of request.citations) {
    if (citation.nodeId) {
      addSeed(seeds, request, citation.nodeId, citation.documentId);
    }
    if (citation.documentId) {
      addSeed(seeds, request, citation.documentId, citation.documentId);
    }
  }
  for (const document of request.documents) {
    addSeed(seeds, request, document.identity.id, document.identity.id);
  }
  return [...seeds];
}

function addSeed(
  seeds: Set<string>,
  request: RetrievalRequest,
  id: string,
  documentId: string | null,
): void {
  const resolved = resolveGraphId(request, id, documentId);
  if (resolved) {
    seeds.add(resolved);
  }
}

function resolveGraphId(
  request: RetrievalRequest,
  id: string,
  documentId: string | null,
): string | null {
  if (request.graph.findNode(id)) {
    return id;
  }
  const asDoc = documentGraphId(id);
  if (request.graph.findNode(asDoc)) {
    return asDoc;
  }
  if (documentId) {
    const provision = provisionGraphId(documentId, id);
    if (request.graph.findNode(provision)) {
      return provision;
    }
  }
  for (const document of request.documents) {
    const provision = provisionGraphId(document.identity.id, id);
    if (request.graph.findNode(provision)) {
      return provision;
    }
  }
  return null;
}
