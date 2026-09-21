import { describe, expect, it } from "vitest";

import {
  AuthorityComparisonResolution,
  GraphEdgeType,
  GraphNodeType,
  compareAuthoritiesByGraph,
  type AsyncGraphRepository,
  type GraphEdge,
  type GraphEdgeUpsertInput,
  type GraphNode,
} from "@/engine/graph";

/** Minimal in-memory AsyncGraphRepository fake — tests the domain module against its interface, not against Prisma. */
class FakeAsyncGraphRepository implements AsyncGraphRepository {
  private readonly edges: GraphEdge[] = [];
  private readonly nodes = new Map<string, GraphNode>();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  async upsertEdges(edges: readonly GraphEdgeUpsertInput[]) {
    for (const edge of edges) {
      this.edges.push({
        id: `${edge.fromNodeId}:${edge.edgeType}:${edge.toNodeId}`,
        type: edge.edgeType,
        fromId: edge.fromNodeId,
        toId: edge.toNodeId,
        evidence: edge.evidence ? [edge.evidence] : [],
      });
    }
    return { inserted: edges.length, updated: 0 };
  }

  async findNode(id: string) {
    return this.nodes.get(id) ?? null;
  }

  async outgoing(nodeId: string, edgeTypes?: readonly GraphEdgeType[]) {
    return this.edges.filter(
      (e) => e.fromId === nodeId && (!edgeTypes || edgeTypes.includes(e.type)),
    );
  }

  async incoming(nodeId: string, edgeTypes?: readonly GraphEdgeType[]) {
    return this.edges.filter(
      (e) => e.toId === nodeId && (!edgeTypes || edgeTypes.includes(e.type)),
    );
  }

  async outgoingForMany(nodeIds: readonly string[], edgeTypes?: readonly GraphEdgeType[]) {
    const idSet = new Set(nodeIds);
    return this.edges.filter(
      (e) => idSet.has(e.fromId) && (!edgeTypes || edgeTypes.includes(e.type)),
    );
  }

  async neighbors() {
    return [];
  }
}

function node(id: string, type: GraphNodeType): GraphNode {
  return { id, type, label: id, documentId: id, jurisdiction: "MN", language: "mn", parentId: null };
}

describe("compareAuthoritiesByGraph", () => {
  it("returns UNKNOWN when neither node exists in the graph — never fabricates a comparison", async () => {
    const repo = new FakeAsyncGraphRepository();
    const result = await compareAuthoritiesByGraph(repo, { nodeId: "graph:doc:a" }, { nodeId: "graph:doc:b" });
    expect(result.resolutionStatus).toBe(AuthorityComparisonResolution.UNKNOWN);
    expect(result.graphRelations).toEqual([]);
  });

  it("returns INSUFFICIENT_EVIDENCE when both nodes exist but there is no relation and no precedence input", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", GraphNodeType.LAW));
    repo.addNode(node("graph:doc:b", GraphNodeType.LAW));
    const result = await compareAuthoritiesByGraph(repo, { nodeId: "graph:doc:a" }, { nodeId: "graph:doc:b" });
    expect(result.resolutionStatus).toBe(AuthorityComparisonResolution.INSUFFICIENT_EVIDENCE);
  });

  it("returns UNRESOLVED when there is no direct relation but a precedence input was supplied — flagged as unverified, not a graph fact", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", GraphNodeType.LAW));
    repo.addNode(node("graph:doc:b", GraphNodeType.GOVERNMENT_REGULATION));
    const result = await compareAuthoritiesByGraph(
      repo,
      { nodeId: "graph:doc:a", precedence: { type: GraphNodeType.LAW } },
      { nodeId: "graph:doc:b", precedence: { type: GraphNodeType.GOVERNMENT_REGULATION } },
    );
    expect(result.resolutionStatus).toBe(AuthorityComparisonResolution.UNRESOLVED);
    expect(result.precedence?.confidence).toBe("DEFAULT_UNVERIFIED");
  });

  it("returns RESOLVED with direct evidence when an explicit REPEALS edge exists between the two authorities", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", GraphNodeType.LAW));
    repo.addNode(node("graph:doc:b", GraphNodeType.LAW));
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:a", toNodeId: "graph:doc:b", fromLabel: "A", toLabel: "B", sourceKind: "DOCUMENT_STRUCTURE" },
    ]);

    const result = await compareAuthoritiesByGraph(repo, { nodeId: "graph:doc:a" }, { nodeId: "graph:doc:b" });
    expect(result.resolutionStatus).toBe(AuthorityComparisonResolution.RESOLVED);
    expect(result.graphRelations).toHaveLength(1);
    expect(result.graphRelations[0]).toMatchObject({ edgeType: GraphEdgeType.REPEALS, direction: "LEFT_TO_RIGHT" });
  });

  it("finds a relation regardless of which side it was authored from (right-to-left direction is reported correctly)", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", GraphNodeType.LAW));
    repo.addNode(node("graph:doc:b", GraphNodeType.LAW));
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.SUPERSEDES, fromNodeId: "graph:doc:b", toNodeId: "graph:doc:a", fromLabel: "B", toLabel: "A", sourceKind: "DOCUMENT_STRUCTURE" },
    ]);

    const result = await compareAuthoritiesByGraph(repo, { nodeId: "graph:doc:a" }, { nodeId: "graph:doc:b" });
    expect(result.graphRelations[0]).toMatchObject({ edgeType: GraphEdgeType.SUPERSEDES, direction: "RIGHT_TO_LEFT" });
  });

  it("does not let an unrelated CONTAINS edge count as evidence between two authorities", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", GraphNodeType.LAW));
    repo.addNode(node("graph:doc:b", GraphNodeType.LAW));
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.CONTAINS, fromNodeId: "graph:doc:a", toNodeId: "graph:doc:b", fromLabel: "A", toLabel: "B", sourceKind: "DOCUMENT_STRUCTURE" },
    ]);
    const result = await compareAuthoritiesByGraph(repo, { nodeId: "graph:doc:a" }, { nodeId: "graph:doc:b" });
    expect(result.resolutionStatus).toBe(AuthorityComparisonResolution.INSUFFICIENT_EVIDENCE);
  });
});
