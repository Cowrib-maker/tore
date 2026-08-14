import type { GraphRepository } from "./graph-repository";
import { GraphEdgeType, type GraphNeighbor, type GraphNode, type GraphNodeType, type NeighborQueryOptions, type RelatedQueryOptions } from "./types";

export class GraphQuery {
  constructor(private readonly repository: GraphRepository) {}

  findNode(id: string): GraphNode | null {
    return this.repository.findNode(id);
  }

  findByType(type: GraphNodeType): GraphNode[] {
    return this.repository.findByType(type);
  }

  neighbors(
    id: string,
    options: NeighborQueryOptions = {},
  ): GraphNeighbor[] {
    if (!this.repository.findNode(id)) {
      return [];
    }
    const direction = options.direction ?? "BOTH";
    const allowed = options.edgeTypes ? new Set(options.edgeTypes) : null;
    const result: GraphNeighbor[] = [];

    if (direction === "OUT" || direction === "BOTH") {
      for (const edge of this.repository.outgoing(id)) {
        if (allowed && !allowed.has(edge.type)) {
          continue;
        }
        const node = this.repository.findNode(edge.toId);
        if (node) {
          result.push({ node, edge, direction: "OUT" });
        }
      }
    }
    if (direction === "IN" || direction === "BOTH") {
      for (const edge of this.repository.incoming(id)) {
        if (allowed && !allowed.has(edge.type)) {
          continue;
        }
        const node = this.repository.findNode(edge.fromId);
        if (node) {
          result.push({ node, edge, direction: "IN" });
        }
      }
    }
    return result;
  }

  /**
   * Breadth-first related authorities, excluding the seed node.
   * Defaults to semantic edges only (not CONTAINS) so hierarchy does not
   * flood GraphRAG-style relatedness.
   */
  findRelated(
    id: string,
    options: RelatedQueryOptions = {},
  ): GraphNode[] {
    const seed = this.repository.findNode(id);
    if (!seed) {
      return [];
    }
    const depth = options.depth ?? 2;
    const directed = options.directed ?? false;
    const allowed = new Set(
      options.edgeTypes ?? SEMANTIC_EDGE_TYPES,
    );
    const seen = new Set<string>([id]);
    const related: GraphNode[] = [];
    let frontier = [id];

    for (let level = 0; level < depth; level += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        const hops = this.neighbors(current, {
          direction: directed ? "OUT" : "BOTH",
          edgeTypes: [...allowed],
        });
        for (const hop of hops) {
          if (seen.has(hop.node.id)) {
            continue;
          }
          seen.add(hop.node.id);
          related.push(hop.node);
          next.push(hop.node.id);
        }
      }
      frontier = next;
    }
    return related;
  }
}

const SEMANTIC_EDGE_TYPES: GraphEdgeType[] = [
  GraphEdgeType.CITES,
  GraphEdgeType.REFERS_TO,
  GraphEdgeType.AMENDS,
  GraphEdgeType.REPEALS,
  GraphEdgeType.IMPLEMENTS,
  GraphEdgeType.INTERPRETS,
  GraphEdgeType.APPLIES,
  GraphEdgeType.RELATED_TO,
];
