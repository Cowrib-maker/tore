import { documentGraphId } from "./ids";
import { GraphNodeType, type GraphEdge, type GraphNode, type GraphSnapshot } from "./types";

export interface GraphRepository {
  apply(snapshot: GraphSnapshot): void;
  replaceDocument(documentId: string, snapshot: GraphSnapshot): void;
  findNode(id: string): GraphNode | null;
  findEdge(id: string): GraphEdge | null;
  findByType(type: GraphNodeType): GraphNode[];
  outgoing(nodeId: string): GraphEdge[];
  incoming(nodeId: string): GraphEdge[];
  allNodes(): GraphNode[];
  allEdges(): GraphEdge[];
}

/**
 * Process-local graph store. Not a database.
 */
export class InMemoryGraphRepository implements GraphRepository {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, GraphEdge>();
  private readonly outgoingIndex = new Map<string, Set<string>>();
  private readonly incomingIndex = new Map<string, Set<string>>();

  apply(snapshot: GraphSnapshot): void {
    for (const node of snapshot.nodes) {
      this.upsertNode(node);
    }
    for (const edge of snapshot.edges) {
      this.upsertEdge(edge);
    }
  }

  replaceDocument(documentId: string, snapshot: GraphSnapshot): void {
    this.removeOwned(documentId);
    this.apply(snapshot);
  }

  findNode(id: string): GraphNode | null {
    return this.nodes.get(id) ?? null;
  }

  findEdge(id: string): GraphEdge | null {
    return this.edges.get(id) ?? null;
  }

  findByType(type: GraphNodeType): GraphNode[] {
    return [...this.nodes.values()].filter((node) => node.type === type);
  }

  outgoing(nodeId: string): GraphEdge[] {
    return this.edgesFor(this.outgoingIndex.get(nodeId));
  }

  incoming(nodeId: string): GraphEdge[] {
    return this.edgesFor(this.incomingIndex.get(nodeId));
  }

  allNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  allEdges(): GraphEdge[] {
    return [...this.edges.values()];
  }

  private upsertNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);
    if (
      existing &&
      existing.type !== GraphNodeType.AUTHORITY &&
      node.type === GraphNodeType.AUTHORITY
    ) {
      return;
    }
    this.nodes.set(node.id, node);
  }

  private upsertEdge(edge: GraphEdge): void {
    const existing = this.edges.get(edge.id);
    if (existing) {
      const evidence = [...existing.evidence];
      for (const item of edge.evidence) {
        if (!evidence.includes(item)) {
          evidence.push(item);
        }
      }
      this.edges.set(edge.id, { ...existing, evidence });
      return;
    }
    this.edges.set(edge.id, edge);
    addIndex(this.outgoingIndex, edge.fromId, edge.id);
    addIndex(this.incomingIndex, edge.toId, edge.id);
  }

  private removeOwned(documentId: string): void {
    const rootId = documentGraphId(documentId);
    const ownedIds = new Set(
      [...this.nodes.values()]
        .filter((node) => node.documentId === documentId)
        .map((node) => node.id),
    );
    for (const edge of [...this.edges.values()]) {
      if (ownedIds.has(edge.fromId)) {
        this.removeEdge(edge.id);
        continue;
      }
      if (ownedIds.has(edge.toId) && edge.toId !== rootId) {
        this.removeEdge(edge.id);
      }
    }
    for (const id of ownedIds) {
      if (id !== rootId) {
        this.nodes.delete(id);
      }
    }
  }

  private removeEdge(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (!edge) {
      return;
    }
    this.edges.delete(edgeId);
    this.outgoingIndex.get(edge.fromId)?.delete(edgeId);
    this.incomingIndex.get(edge.toId)?.delete(edgeId);
  }

  private edgesFor(ids: Set<string> | undefined): GraphEdge[] {
    if (!ids) {
      return [];
    }
    const result: GraphEdge[] = [];
    for (const id of ids) {
      const edge = this.edges.get(id);
      if (edge) {
        result.push(edge);
      }
    }
    return result;
  }
}

function addIndex(
  index: Map<string, Set<string>>,
  nodeId: string,
  edgeId: string,
): void {
  const bucket = index.get(nodeId);
  if (bucket) {
    bucket.add(edgeId);
    return;
  }
  index.set(nodeId, new Set([edgeId]));
}
