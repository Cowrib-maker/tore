import { describe, expect, it } from "vitest";

import {
  ConflictFindingType,
  ConflictResolutionStatus,
  GraphEdgeType,
  GraphNodeType,
  detectAuthorityConflicts,
  type AsyncGraphRepository,
  type GraphEdge,
  type GraphEdgeUpsertInput,
  type GraphNode,
} from "@/engine/graph";

/** Minimal in-memory AsyncGraphRepository fake, mirroring authority-comparison.test.ts. */
class FakeAsyncGraphRepository implements AsyncGraphRepository {
  private readonly edges: GraphEdge[] = [];
  private readonly nodes = new Map<string, GraphNode>();
  public outgoingForManyCalls = 0;

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
    return this.edges.filter((e) => e.toId === nodeId && (!edgeTypes || edgeTypes.includes(e.type)));
  }

  async outgoingForMany(nodeIds: readonly string[], edgeTypes?: readonly GraphEdgeType[]) {
    this.outgoingForManyCalls += 1;
    const idSet = new Set(nodeIds);
    return this.edges.filter((e) => idSet.has(e.fromId) && (!edgeTypes || edgeTypes.includes(e.type)));
  }

  async neighbors() {
    return [];
  }
}

function node(id: string, type: GraphNodeType): GraphNode {
  return { id, type, label: id, documentId: id, jurisdiction: "MN", language: "mn", parentId: null };
}

describe("detectAuthorityConflicts", () => {
  it("returns no findings for fewer than two authorities", async () => {
    const repo = new FakeAsyncGraphRepository();
    expect(await detectAuthorityConflicts(repo, [{ nodeId: "graph:doc:a" }])).toEqual([]);
    expect(await detectAuthorityConflicts(repo, [])).toEqual([]);
  });

  it("returns no findings when the graph has no relations between the authorities (honest, not fake certainty)", async () => {
    const repo = new FakeAsyncGraphRepository();
    repo.addNode(node("graph:doc:a", GraphNodeType.LAW));
    repo.addNode(node("graph:doc:b", GraphNodeType.LAW));
    const findings = await detectAuthorityConflicts(repo, [{ nodeId: "graph:doc:a" }, { nodeId: "graph:doc:b" }]);
    expect(findings).toEqual([]);
  });

  it("detects an EXPLICIT_REPEALS conflict between two authorities surfaced for the same answer, resolved by direct evidence", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:new", toNodeId: "graph:doc:old", fromLabel: "New law", toLabel: "Old law", sourceKind: "DOCUMENT_STRUCTURE", evidence: "art. 45" },
    ]);
    const findings = await detectAuthorityConflicts(repo, [{ nodeId: "graph:doc:old" }, { nodeId: "graph:doc:new" }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: ConflictFindingType.EXPLICIT_REPEALS,
      resolutionStatus: ConflictResolutionStatus.RESOLVED,
    });
    expect(findings[0]!.evidence).toContain("art. 45");
  });

  it("detects an EXPLICIT_SUPERSEDES conflict distinctly from REPEALS", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.SUPERSEDES, fromNodeId: "graph:doc:new", toNodeId: "graph:doc:old", fromLabel: "New", toLabel: "Old", sourceKind: "DOCUMENT_STRUCTURE" },
    ]);
    const findings = await detectAuthorityConflicts(repo, [{ nodeId: "graph:doc:old" }, { nodeId: "graph:doc:new" }]);
    expect(findings[0]!.type).toBe(ConflictFindingType.EXPLICIT_SUPERSEDES);
  });

  it("detects TEMPORAL_INCOMPATIBILITY when one authority is in force and the other is not, with no graph relation", async () => {
    const repo = new FakeAsyncGraphRepository();
    const findings = await detectAuthorityConflicts(repo, [
      { nodeId: "graph:doc:a", precedence: { type: GraphNodeType.LAW, force: "IN_FORCE" } },
      { nodeId: "graph:doc:b", precedence: { type: GraphNodeType.LAW, force: "NOT_IN_FORCE" } },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe(ConflictFindingType.TEMPORAL_INCOMPATIBILITY);
    expect(findings[0]!.resolutionStatus).toBe(ConflictResolutionStatus.RESOLVED);
  });

  it("does not flag a temporal conflict when both authorities agree on force", async () => {
    const repo = new FakeAsyncGraphRepository();
    const findings = await detectAuthorityConflicts(repo, [
      { nodeId: "graph:doc:a", precedence: { type: GraphNodeType.LAW, force: "IN_FORCE" } },
      { nodeId: "graph:doc:b", precedence: { type: GraphNodeType.LAW, force: "IN_FORCE" } },
    ]);
    expect(findings).toEqual([]);
  });

  it("never claims a semantic conflict from a CITES or RELATED_TO edge alone", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.CITES, fromNodeId: "graph:doc:a", toNodeId: "graph:doc:b", fromLabel: "A", toLabel: "B", sourceKind: "LEGALINFO_CROSS_REFERENCE" },
      { edgeType: GraphEdgeType.RELATED_TO, fromNodeId: "graph:doc:a", toNodeId: "graph:doc:b", fromLabel: "A", toLabel: "B", sourceKind: "DOCUMENT_STRUCTURE" },
    ]);
    const findings = await detectAuthorityConflicts(repo, [{ nodeId: "graph:doc:a" }, { nodeId: "graph:doc:b" }]);
    expect(findings).toEqual([]);
  });

  it("evaluates a bounded set of authorities (3 authorities => 3 pairs) with exactly one batched graph query, never one per pair", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      { edgeType: GraphEdgeType.REPEALS, fromNodeId: "graph:doc:c", toNodeId: "graph:doc:a", fromLabel: "C", toLabel: "A", sourceKind: "DOCUMENT_STRUCTURE" },
    ]);
    const findings = await detectAuthorityConflicts(repo, [
      { nodeId: "graph:doc:a" },
      { nodeId: "graph:doc:b" },
      { nodeId: "graph:doc:c" },
    ]);
    expect(findings).toHaveLength(1);
    expect(repo.outgoingForManyCalls).toBe(1);
  });
});
