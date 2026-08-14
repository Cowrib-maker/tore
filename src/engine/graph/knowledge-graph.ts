import type { LegalDocument } from "../knowledge/schema";
import { GraphBuilder } from "./graph-builder";
import { GraphQuery } from "./graph-query";
import {
  InMemoryGraphRepository,
  type GraphRepository,
} from "./graph-repository";
import type {
  GraphNeighbor,
  GraphNode,
  GraphNodeType,
  NeighborQueryOptions,
  RelatedQueryOptions,
} from "./types";

/**
 * Legal Knowledge Graph Engine facade.
 * Deterministic, in-memory, no models or embeddings.
 */
export class KnowledgeGraph {
  readonly query: GraphQuery;

  constructor(
    private readonly repository: GraphRepository = new InMemoryGraphRepository(),
    private readonly builder: GraphBuilder = new GraphBuilder(),
  ) {
    this.query = new GraphQuery(repository);
  }

  addDocument(document: LegalDocument): void {
    const snapshot = this.builder.build(document);
    this.repository.replaceDocument(document.identity.id, snapshot);
  }

  findNode(id: string): GraphNode | null {
    return this.query.findNode(id);
  }

  neighbors(id: string, options?: NeighborQueryOptions): GraphNeighbor[] {
    return this.query.neighbors(id, options);
  }

  findRelated(id: string, options?: RelatedQueryOptions): GraphNode[] {
    return this.query.findRelated(id, options);
  }

  findByType(type: GraphNodeType): GraphNode[] {
    return this.query.findByType(type);
  }
}

export function createKnowledgeGraph(
  repository: GraphRepository = new InMemoryGraphRepository(),
): KnowledgeGraph {
  return new KnowledgeGraph(repository);
}
