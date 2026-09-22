import { describe, expect, it } from "vitest";

import {
  GraphEdgeType,
  GraphNodeType,
  RepealChainTerminalReason,
  resolveRepealChain,
  type AsyncGraphRepository,
  type GraphEdge,
  type GraphEdgeUpsertInput,
  type GraphNode,
} from "@/engine/graph";

/** Minimal in-memory AsyncGraphRepository fake, mirroring conflict-detection.test.ts. */
class FakeAsyncGraphRepository implements AsyncGraphRepository {
  private readonly edges: GraphEdge[] = [];
  private readonly nodes = new Map<string, GraphNode>();
  public incomingCalls = 0;

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
    return this.edges.filter((e) => e.fromId === nodeId && (!edgeTypes || edgeTypes.includes(e.type)));
  }

  async incoming(nodeId: string, edgeTypes?: readonly GraphEdgeType[]) {
    this.incomingCalls += 1;
    return this.edges.filter((e) => e.toId === nodeId && (!edgeTypes || edgeTypes.includes(e.type)));
  }

  async outgoingForMany(nodeIds: readonly string[], edgeTypes?: readonly GraphEdgeType[]) {
    const idSet = new Set(nodeIds);
    return this.edges.filter((e) => idSet.has(e.fromId) && (!edgeTypes || edgeTypes.includes(e.type)));
  }

  async neighbors() {
    return [];
  }
}

function node(id: string, label: string): GraphNode {
  return { id, type: GraphNodeType.LAW, label, documentId: id, jurisdiction: "MN", language: "mn", parentId: null };
}

describe("resolveRepealChain", () => {
  it("A: a source with no incoming REPEALS edge is NOT_REPEALED, empty chain", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", "Law A"));
    const result = await resolveRepealChain(repo, "graph:doc:a");
    expect(result.chain).toEqual([]);
    expect(result.terminalReason).toBe(RepealChainTerminalReason.NOT_REPEALED);
    expect(result.terminalNodeId).toBeNull();
  });

  it("A -> B: one direct repealer, terminal is the repealer", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", "Law A"));
    repo.addNode(node("graph:doc:b", "Law B"));
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:b", toNodeId: "graph:doc:a", fromLabel: "Law B", toLabel: "Law A", sourceKind: "LEGALINFO_REPEAL_DECLARATION", evidence: "B repeals A" },
    ]);
    const result = await resolveRepealChain(repo, "graph:doc:a");
    expect(result.chain).toHaveLength(1);
    expect(result.chain[0]).toMatchObject({
      repealedNodeId: "graph:doc:a",
      repealerNodeId: "graph:doc:b",
      edgeType: GraphEdgeType.REPEALS,
    });
    expect(result.chain[0]!.evidence).toContain("B repeals A");
    expect(result.terminalNodeId).toBe("graph:doc:b");
    expect(result.terminalReason).toBe(RepealChainTerminalReason.NO_FURTHER_REPEAL);
    expect(result.cycle).toBeNull();
  });

  it("A -> B -> C: a two-hop chain (the repealer was itself later repealed)", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:b", toNodeId: "graph:doc:a", fromLabel: "B", toLabel: "A", sourceKind: "LEGALINFO_REPEAL_DECLARATION" },
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:c", toNodeId: "graph:doc:b", fromLabel: "C", toLabel: "B", sourceKind: "LEGALINFO_REPEAL_DECLARATION" },
    ]);
    const result = await resolveRepealChain(repo, "graph:doc:a");
    expect(result.chain).toHaveLength(2);
    expect(result.chain[0]).toMatchObject({ repealedNodeId: "graph:doc:a", repealerNodeId: "graph:doc:b" });
    expect(result.chain[1]).toMatchObject({ repealedNodeId: "graph:doc:b", repealerNodeId: "graph:doc:c" });
    expect(result.terminalNodeId).toBe("graph:doc:c");
    expect(result.terminalReason).toBe(RepealChainTerminalReason.NO_FURTHER_REPEAL);
  });

  it("A -> missing: real corpus shape — the repealer (9406) itself was never further repealed, terminates cleanly at it", async () => {
    const repo = new FakeAsyncGraphRepository();
    // Mirrors the real 9406 -> 563 edge: 563 (the repealed target) has no incoming repealer beyond 9406.
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:9406", toNodeId: "graph:doc:563", fromLabel: "9406", toLabel: "563", sourceKind: "LEGALINFO_REPEAL_DECLARATION", evidence: "real repeal declaration" },
    ]);
    const result = await resolveRepealChain(repo, "graph:doc:563");
    expect(result.chain).toHaveLength(1);
    expect(result.terminalNodeId).toBe("graph:doc:9406");
    expect(result.terminalReason).toBe(RepealChainTerminalReason.NO_FURTHER_REPEAL);
  });

  it("starting from an unresolved/never-ingested node: nothing in the graph targets it, so NOT_REPEALED (never manufactures a chain for a missing node)", async () => {
    const repo = new FakeAsyncGraphRepository();
    const result = await resolveRepealChain(repo, "graph:ext:LEGALINFO_LAW_ID:999999");
    expect(result.chain).toEqual([]);
    expect(result.terminalReason).toBe(RepealChainTerminalReason.NOT_REPEALED);
  });

  it("A -> B -> A cycle: traversal stops and reports the cycle instead of looping forever", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:b", toNodeId: "graph:doc:a", fromLabel: "B", toLabel: "A", sourceKind: "LEGALINFO_REPEAL_DECLARATION" },
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:a", toNodeId: "graph:doc:b", fromLabel: "A", toLabel: "B", sourceKind: "LEGALINFO_REPEAL_DECLARATION" },
    ]);
    const result = await resolveRepealChain(repo, "graph:doc:a", { maxDepth: 10 });
    expect(result.terminalReason).toBe(RepealChainTerminalReason.CYCLE_DETECTED);
    expect(result.cycle).toEqual({ atNodeId: "graph:doc:a" });
    // stopped, not run away — at most 2 hops for a 2-node cycle
    expect(result.chain.length).toBeLessThanOrEqual(2);
  });

  it("multiple repeal edges targeting the same node: deterministic choice, not random", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:z-repealer", toNodeId: "graph:doc:a", fromLabel: "Z", toLabel: "A", sourceKind: "LEGALINFO_REPEAL_DECLARATION" },
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:m-repealer", toNodeId: "graph:doc:a", fromLabel: "M", toLabel: "A", sourceKind: "LEGALINFO_REPEAL_DECLARATION" },
    ]);
    const first = await resolveRepealChain(repo, "graph:doc:a");
    const second = await resolveRepealChain(repo, "graph:doc:a");
    expect(first.chain[0]!.repealerNodeId).toBe("graph:doc:m-repealer");
    expect(second.chain[0]!.repealerNodeId).toBe(first.chain[0]!.repealerNodeId);
  });

  it("duplicate/idempotent traversal: calling twice against the same graph state returns an identical result", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:b", toNodeId: "graph:doc:a", fromLabel: "B", toLabel: "A", sourceKind: "LEGALINFO_REPEAL_DECLARATION" },
    ]);
    const first = await resolveRepealChain(repo, "graph:doc:a");
    const second = await resolveRepealChain(repo, "graph:doc:a");
    expect(second).toEqual(first);
  });

  it("respects a bounded max depth on a long chain that never cycles", async () => {
    const repo = new FakeAsyncGraphRepository();
    // a -> repealed by b -> repealed by c -> repealed by d -> repealed by e (4 hops)
    const links: Array<[string, string]> = [
      ["b", "a"],
      ["c", "b"],
      ["d", "c"],
      ["e", "d"],
    ];
    await repo.upsertEdges(
      links.map(([from, to]) => ({
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: `graph:doc:${from}`,
        toNodeId: `graph:doc:${to}`,
        fromLabel: from,
        toLabel: to,
        sourceKind: "LEGALINFO_REPEAL_DECLARATION",
      })),
    );
    const bounded = await resolveRepealChain(repo, "graph:doc:a", { maxDepth: 2 });
    expect(bounded.chain).toHaveLength(2);
    expect(bounded.terminalReason).toBe(RepealChainTerminalReason.MAX_DEPTH_REACHED);

    const unbounded = await resolveRepealChain(repo, "graph:doc:a", { maxDepth: 10 });
    expect(unbounded.chain).toHaveLength(4);
    expect(unbounded.terminalReason).toBe(RepealChainTerminalReason.NO_FURTHER_REPEAL);
  });
});
