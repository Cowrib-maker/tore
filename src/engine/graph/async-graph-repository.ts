import type { GraphEdge, GraphEdgeType, GraphNeighbor, GraphNode } from "./types";

/**
 * Persistence-facing edge write. Deliberately separate from GraphEdge:
 * GraphEdge is a read-model (fromId/toId only); writing an edge also
 * needs provenance (which document produced it, what evidence backs it,
 * and a label to render the target even if it hasn't been ingested yet).
 */
export type GraphEdgeUpsertInput = {
  edgeType: GraphEdgeType;
  fromNodeId: string;
  toNodeId: string;
  fromDocumentId?: string | null;
  toDocumentId?: string | null;
  fromLabel: string;
  toLabel: string;
  /** Provenance of the extraction method, e.g. "LEGALINFO_CROSS_REFERENCE", "DOCUMENT_STRUCTURE". Never the legal source itself. */
  sourceKind: string;
  evidence?: string | null;
};

export type GraphEdgeUpsertSummary = {
  inserted: number;
  updated: number;
};

/**
 * Real (async, database-backed) counterpart to GraphRepository.
 *
 * GraphRepository (graph-repository.ts) stays synchronous and in-memory —
 * it is not modified or replaced by this interface. This port exists
 * because a real persistence adapter cannot honestly implement a
 * synchronous contract. Node identity and query semantics intentionally
 * mirror GraphRepository/GraphQuery so callers can reason about both the
 * same way; only the transport (sync in-memory vs. async database) differs.
 */
export interface AsyncGraphRepository {
  /** Idempotent: re-applying the same edges updates evidence/labels, never duplicates rows. */
  upsertEdges(edges: readonly GraphEdgeUpsertInput[]): Promise<GraphEdgeUpsertSummary>;

  findNode(id: string): Promise<GraphNode | null>;

  outgoing(nodeId: string, edgeTypes?: readonly GraphEdgeType[]): Promise<GraphEdge[]>;

  incoming(nodeId: string, edgeTypes?: readonly GraphEdgeType[]): Promise<GraphEdge[]>;

  /**
   * All outgoing edges FROM any of `nodeIds`, in one query. Exists so a
   * caller comparing a bounded set of authorities (e.g. the handful
   * resolved for one answer) never issues one `outgoing()` call per node
   * — see authority-comparison.ts / conflict-detection.ts, the only
   * current callers.
   */
  outgoingForMany(
    nodeIds: readonly string[],
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphEdge[]>;

  neighbors(
    nodeId: string,
    options?: { direction?: "OUT" | "IN" | "BOTH"; edgeTypes?: readonly GraphEdgeType[] },
  ): Promise<GraphNeighbor[]>;
}
