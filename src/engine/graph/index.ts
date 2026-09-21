/**
 * TORE Legal Knowledge Graph Engine.
 *
 * Represents relationships among legal authorities as a directed graph.
 * Independent of Gateway, Citation Engine, source adapters, and parsers.
 */

export {
  GraphEdgeType,
  GraphNodeType,
} from "./types";
export type {
  GraphEdge,
  GraphNeighbor,
  GraphNode,
  GraphSnapshot,
  NeighborQueryOptions,
  RelatedQueryOptions,
} from "./types";

export { GraphBuilder } from "./graph-builder";
export { GraphQuery } from "./graph-query";
export {
  InMemoryGraphRepository,
  type GraphRepository,
} from "./graph-repository";
export { KnowledgeGraph, createKnowledgeGraph } from "./knowledge-graph";
export {
  documentGraphId,
  externalGraphId,
  graphEdgeId,
  parseGraphNodeId,
  provisionGraphId,
  unresolvedGraphId,
  type ParsedGraphNodeId,
} from "./ids";

export type {
  AsyncGraphRepository,
  GraphEdgeUpsertInput,
  GraphEdgeUpsertSummary,
} from "./async-graph-repository";

export {
  AuthorityPrecedenceBasis,
  AuthorityPrecedenceConfidence,
  AuthorityPrecedenceOutcome,
  DEFAULT_AUTHORITY_PRECEDENCE_TIERS,
  compareAuthorityPrecedence,
  defaultAuthorityPrecedencePolicy,
  type AuthorityForceStatus,
  type AuthorityPrecedenceCandidate,
  type AuthorityPrecedencePolicy,
  type AuthorityPrecedenceResult,
  type DocumentLevelGraphNodeType,
} from "./authority-precedence";

export {
  AuthorityComparisonResolution,
  COMPARABLE_EDGE_TYPES,
  batchDirectRelations,
  compareAuthoritiesByGraph,
  type AuthorityComparison,
  type AuthorityComparisonSide,
  type GraphRelationEvidence,
} from "./authority-comparison";

export {
  ConflictFindingType,
  ConflictResolutionStatus,
  detectAuthorityConflicts,
  type ConflictCandidate,
  type ConflictFinding,
} from "./conflict-detection";
