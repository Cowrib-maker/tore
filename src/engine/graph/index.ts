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
  provisionGraphId,
  unresolvedGraphId,
} from "./ids";
