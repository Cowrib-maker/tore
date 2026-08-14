import type {
  LegalCitation,
  LegalCitationTarget,
  LegalDocument,
  LegalDocumentRelation,
  LegalNode,
} from "../knowledge/schema";
import {
  documentGraphId,
  externalGraphId,
  graphEdgeId,
  provisionGraphId,
  unresolvedGraphId,
} from "./ids";
import {
  documentNodeType,
  edgeTypeFromCitationRole,
  edgeTypeFromRelation,
  isUnresolvedTarget,
  provisionNodeType,
} from "./mapping";
import {
  GraphEdgeType,
  GraphNodeType,
  type GraphEdge,
  type GraphNode,
  type GraphSnapshot,
} from "./types";

/**
 * Deterministic LegalDocument → graph snapshot.
 * Does not read HTML, call models, or touch storage.
 */
export class GraphBuilder {
  build(document: LegalDocument): GraphSnapshot {
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();

    const docId = document.identity.id;
    const rootId = documentGraphId(docId);
    upsertNode(nodes, {
      id: rootId,
      type: documentNodeType(document),
      label: document.identity.shortTitle ?? document.identity.title,
      documentId: docId,
      jurisdiction: document.identity.jurisdiction,
      language: document.identity.language,
      parentId: null,
    });

    for (const child of document.hierarchy) {
      walkProvision(child, rootId, document, nodes, edges);
    }

    addCitationList(document.citations, rootId, document, nodes, edges);
    for (const relation of document.relations) {
      addRelation(relation, rootId, document, nodes, edges);
    }
    addSourceLinks(document, rootId, nodes, edges);

    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
    };
  }
}

function walkProvision(
  node: LegalNode,
  parentId: string,
  document: LegalDocument,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const id = provisionGraphId(document.identity.id, node.id);
  upsertNode(nodes, {
    id,
    type: provisionNodeType(node.kind),
    label: node.heading ?? node.locator?.display ?? node.text ?? node.path,
    documentId: document.identity.id,
    jurisdiction: document.identity.jurisdiction,
    language: document.identity.language,
    parentId,
  });
  addEdge(edges, {
    id: graphEdgeId(parentId, GraphEdgeType.CONTAINS, id),
    type: GraphEdgeType.CONTAINS,
    fromId: parentId,
    toId: id,
    evidence: [],
  });
  addCitationList(node.citations, id, document, nodes, edges);
  for (const child of node.children) {
    walkProvision(child, id, document, nodes, edges);
  }
}

function addCitationList(
  citations: LegalCitation[],
  fromId: string,
  document: LegalDocument,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  for (const citation of citations) {
    const origin = citation.fromNodeId
      ? provisionGraphId(document.identity.id, citation.fromNodeId)
      : fromId;
    const target = ensureTarget(citation.target, document, nodes);
    const type = isUnresolvedTarget(citation.target)
      ? GraphEdgeType.REFERS_TO
      : edgeTypeFromCitationRole(citation.role);
    addEdge(edges, {
      id: graphEdgeId(origin, type, target.id),
      type,
      fromId: origin,
      toId: target.id,
      evidence: citation.rawText ? [citation.rawText] : [],
    });
  }
}

function addRelation(
  relation: LegalDocumentRelation,
  fromId: string,
  document: LegalDocument,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const target = ensureTarget(relation.target, document, nodes);
  const type = isUnresolvedTarget(relation.target)
    ? GraphEdgeType.REFERS_TO
    : edgeTypeFromRelation(relation.type);
  addEdge(edges, {
    id: graphEdgeId(fromId, type, target.id),
    type,
    fromId,
    toId: target.id,
    evidence: [],
  });
}

function addSourceLinks(
  document: LegalDocument,
  fromId: string,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const source = document.source;
  if (source.kind === "GOVERNMENT_REGULATION" && source.enablingAuthority) {
    const target = ensureTarget(source.enablingAuthority, document, nodes);
    addEdge(edges, {
      id: graphEdgeId(fromId, GraphEdgeType.IMPLEMENTS, target.id),
      type: GraphEdgeType.IMPLEMENTS,
      fromId,
      toId: target.id,
      evidence: [],
    });
  }
  if (source.kind === "LEGAL_COMMENTARY" && source.commentedAuthority) {
    const target = ensureTarget(source.commentedAuthority, document, nodes);
    addEdge(edges, {
      id: graphEdgeId(fromId, GraphEdgeType.INTERPRETS, target.id),
      type: GraphEdgeType.INTERPRETS,
      fromId,
      toId: target.id,
      evidence: [],
    });
  }
}

function ensureTarget(
  target: LegalCitationTarget,
  document: LegalDocument,
  nodes: Map<string, GraphNode>,
): GraphNode {
  if (target.type === "INTERNAL_NODE") {
    const id = provisionGraphId(document.identity.id, target.nodeId);
    const existing = nodes.get(id);
    if (existing) {
      return existing;
    }
    return upsertNode(nodes, {
      id,
      type: GraphNodeType.PROVISION,
      label: target.nodeId,
      documentId: document.identity.id,
      jurisdiction: document.identity.jurisdiction,
      language: document.identity.language,
      parentId: null,
    });
  }
  if (target.type === "DOCUMENT") {
    const id = documentGraphId(target.documentId);
    return (
      nodes.get(id) ??
      upsertNode(nodes, {
        id,
        type: GraphNodeType.AUTHORITY,
        label: target.documentId,
        documentId: target.documentId,
        jurisdiction: null,
        language: null,
        parentId: null,
      })
    );
  }
  if (target.type === "EXTERNAL_AUTHORITY") {
    const id = externalGraphId(
      target.identifier.scheme,
      target.identifier.value,
    );
    return (
      nodes.get(id) ??
      upsertNode(nodes, {
        id,
        type: GraphNodeType.AUTHORITY,
        label: target.identifier.value,
        documentId: null,
        jurisdiction: null,
        language: null,
        parentId: null,
      })
    );
  }
  const id = unresolvedGraphId(target.rawText);
  return (
    nodes.get(id) ??
    upsertNode(nodes, {
      id,
      type: GraphNodeType.AUTHORITY,
      label: target.rawText,
      documentId: null,
      jurisdiction: null,
      language: null,
      parentId: null,
    })
  );
}

function upsertNode(
  nodes: Map<string, GraphNode>,
  node: GraphNode,
): GraphNode {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return node;
  }
  if (existing.type === GraphNodeType.AUTHORITY && node.type !== GraphNodeType.AUTHORITY) {
    nodes.set(node.id, node);
    return node;
  }
  return existing;
}

function addEdge(edges: Map<string, GraphEdge>, edge: GraphEdge): void {
  const existing = edges.get(edge.id);
  if (!existing) {
    edges.set(edge.id, edge);
    return;
  }
  const evidence = [...existing.evidence];
  for (const item of edge.evidence) {
    if (!evidence.includes(item)) {
      evidence.push(item);
    }
  }
  edges.set(edge.id, { ...existing, evidence });
}
