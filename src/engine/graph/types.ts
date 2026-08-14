/**
 * Contracts for the TORE Legal Knowledge Graph.
 *
 * Country-agnostic authority graph. No embeddings, models, or I/O.
 * Node/edge types are stable so a later GraphRAG layer can traverse them.
 */

export const GraphNodeType = {
  LAW: "LAW",
  ARTICLE: "ARTICLE",
  PARAGRAPH: "PARAGRAPH",
  SUBPARAGRAPH: "SUBPARAGRAPH",
  COURT_DECISION: "COURT_DECISION",
  SUPREME_COURT_RESOLUTION: "SUPREME_COURT_RESOLUTION",
  PROSECUTOR_GUIDELINE: "PROSECUTOR_GUIDELINE",
  GOVERNMENT_REGULATION: "GOVERNMENT_REGULATION",
  LEGAL_COMMENTARY: "LEGAL_COMMENTARY",
  /** Other provisions (item, chapter, holding, …) still get a stable node. */
  PROVISION: "PROVISION",
  /** Placeholder for an external or unresolved authority. */
  AUTHORITY: "AUTHORITY",
} as const;

export type GraphNodeType = (typeof GraphNodeType)[keyof typeof GraphNodeType];

export const GraphEdgeType = {
  CITES: "CITES",
  REFERS_TO: "REFERS_TO",
  AMENDS: "AMENDS",
  REPEALS: "REPEALS",
  IMPLEMENTS: "IMPLEMENTS",
  INTERPRETS: "INTERPRETS",
  APPLIES: "APPLIES",
  RELATED_TO: "RELATED_TO",
  /** Document tree. Required for hierarchical GraphRAG traversal. */
  CONTAINS: "CONTAINS",
} as const;

export type GraphEdgeType = (typeof GraphEdgeType)[keyof typeof GraphEdgeType];

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  documentId: string | null;
  jurisdiction: string | null;
  language: string | null;
  parentId: string | null;
};

export type GraphEdge = {
  id: string;
  type: GraphEdgeType;
  fromId: string;
  toId: string;
  evidence: string[];
};

export type GraphNeighbor = {
  node: GraphNode;
  edge: GraphEdge;
  direction: "OUT" | "IN";
};

export type NeighborQueryOptions = {
  direction?: "OUT" | "IN" | "BOTH";
  edgeTypes?: readonly GraphEdgeType[];
};

export type RelatedQueryOptions = {
  depth?: number;
  edgeTypes?: readonly GraphEdgeType[];
  directed?: boolean;
};

export type GraphSnapshot = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
