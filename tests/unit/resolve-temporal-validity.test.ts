import { describe, expect, it } from "vitest";

import {
  GraphEdgeType,
  GraphNodeType,
  type AsyncGraphRepository,
  type GraphEdge,
  type GraphEdgeUpsertInput,
  type GraphNode,
} from "@/engine/graph";
import { LegalTemporalEvaluationStatus, LegalTemporalStatusBasis } from "@/engine/knowledge";
import { resolveTemporalValidity } from "@/application/legal-graph/resolve-temporal-validity";

/** Minimal in-memory AsyncGraphRepository fake, mirroring repeal-chain.test.ts. */
class FakeAsyncGraphRepository implements AsyncGraphRepository {
  private readonly edges: GraphEdge[] = [];
  private readonly nodes = new Map<string, GraphNode>();

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
    const idSet = new Set(nodeIds);
    return this.edges.filter((e) => idSet.has(e.fromId) && (!edgeTypes || edgeTypes.includes(e.type)));
  }

  async neighbors() {
    return [];
  }
}

const NOW = () => new Date("2026-09-22T00:00:00.000Z");

describe("resolveTemporalValidity", () => {
  it("A. date evidence alone (IN_FORCE) is decisive, independent of any graph state", async () => {
    const repo = new FakeAsyncGraphRepository();
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:a", lawId: "367", validFrom: "1992-02-12", validTo: null, sourceStatus: "IN_FORCE" },
      { now: NOW },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.IN_FORCE);
    expect(result.effectiveFrom).toBe("1992-02-12");
    expect(result.uncertainty).toBeNull();
    expect(result.repealChain).toBeNull();
  });

  it("B. historical query inside a known validity window is HISTORICALLY_IN_FORCE, date-sensitive", async () => {
    const repo = new FakeAsyncGraphRepository();
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:a", validFrom: "2010-01-01", validTo: "2020-12-31" },
      { asOfDate: "2015-06-15" },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.HISTORICALLY_IN_FORCE);
    expect(result.effectiveUntil).toBe("2020-12-31");
  });

  it("C. no dates, no graph evidence at all is UNKNOWN with an explanatory uncertainty message", async () => {
    const repo = new FakeAsyncGraphRepository();
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:a", validFrom: null, validTo: null },
      { now: NOW },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA);
    expect(result.uncertainty).not.toBeNull();
    expect(result.repealChain).toBeNull();
  });

  it("D. explicit repeal-chain evidence, CURRENT query (no asOfDate): resolves to REPEALED without inventing a date", async () => {
    const repo = new FakeAsyncGraphRepository();
    // mirrors the real 9406 -> 563 edge
    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: "graph:doc:9406",
        toNodeId: "graph:doc:563",
        fromLabel: "9406",
        toLabel: "563",
        sourceKind: "LEGALINFO_REPEAL_DECLARATION",
        evidence: "real repeal declaration text",
      },
    ]);
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:563", lawId: "563", validFrom: null, validTo: null },
      { now: NOW },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.REPEALED);
    expect(result.basis).toBe(LegalTemporalStatusBasis.EXPLICIT_REPEAL_DATE_UNKNOWN);
    expect(result.effectiveUntil).toBeNull();
    expect(result.evidence).toContain("real repeal declaration text");
    expect(result.uncertainty).toMatch(/effective date/i);
    expect(result.repealChain?.chain).toHaveLength(1);
  });

  it("E. explicit repeal-chain evidence, HISTORICAL query: stays UNKNOWN — cannot prove the repeal predates asOfDate without a date", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: "graph:doc:9406",
        toNodeId: "graph:doc:563",
        fromLabel: "9406",
        toLabel: "563",
        sourceKind: "LEGALINFO_REPEAL_DECLARATION",
        evidence: "real repeal declaration text",
      },
    ]);
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:563", lawId: "563", validFrom: null, validTo: null },
      { asOfDate: "1995-01-01" },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.status).not.toBe(LegalTemporalEvaluationStatus.REPEALED);
    expect(result.basis).toBe(LegalTemporalStatusBasis.EXPLICIT_REPEAL_DATE_UNKNOWN);
    expect(result.uncertainty).toMatch(/historical date/i);
  });

  it("F. a caller-supplied, DATED explicit relation still wins outright — precise date evidence beats dateless graph-chain evidence", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: "graph:doc:9406",
        toNodeId: "graph:doc:563",
        fromLabel: "9406",
        toLabel: "563",
        sourceKind: "LEGALINFO_REPEAL_DECLARATION",
      },
    ]);
    const result = await resolveTemporalValidity(
      repo,
      {
        nodeId: "graph:doc:563",
        lawId: "563",
        validFrom: "2001-04-19",
        validTo: null,
        explicitRelations: [
          {
            relationType: "REPEALS",
            fromLawId: "9406",
            toLawId: "563",
            effectiveDate: "2015-01-01",
            sourceLawId: "9406",
            evidence: "dated repeal relation supplied by caller",
          },
        ],
      },
      { asOfDate: "2020-01-01" },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.REPEALED);
    expect(result.basis).toBe(LegalTemporalStatusBasis.EXPLICIT_REPEAL);
    expect(result.effectiveUntil).toBeNull();
  });

  it("G. a real-corpus case (563): validFrom known (2013-01-01) and repeal-chain evidence present — a historical query BEFORE validFrom is UNKNOWN with plain SOURCE_DATES basis, not the repeal-flavored one, since the repeal is irrelevant before the source even existed", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: "graph:doc:9406",
        toNodeId: "graph:doc:563",
        fromLabel: "9406",
        toLabel: "563",
        sourceKind: "LEGALINFO_REPEAL_DECLARATION",
        evidence: "real repeal declaration text",
      },
    ]);
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:563", lawId: "563", validFrom: "2013-01-01", validTo: null },
      { asOfDate: "2012-01-01" },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.SOURCE_DATES);
    expect(result.effectiveFrom).toBe("2013-01-01");
    expect(result.repealChain).toBeNull();
    expect(result.uncertainty).toBeNull();
  });

  it("the same real-corpus case, queried AFTER its known validFrom, still uses repeal-chain evidence normally", async () => {
    const repo = new FakeAsyncGraphRepository();
    await repo.upsertEdges([
      {
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: "graph:doc:9406",
        toNodeId: "graph:doc:563",
        fromLabel: "9406",
        toLabel: "563",
        sourceKind: "LEGALINFO_REPEAL_DECLARATION",
        evidence: "real repeal declaration text",
      },
    ]);
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:563", lawId: "563", validFrom: "2013-01-01", validTo: null },
      { asOfDate: "2015-01-01" },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.EXPLICIT_REPEAL_DATE_UNKNOWN);
  });

  it("does not manufacture repeal evidence for a source with no incoming graph edges", async () => {
    const repo = new FakeAsyncGraphRepository();
    const result = await resolveTemporalValidity(
      repo,
      { nodeId: "graph:doc:untouched", validFrom: null, validTo: null },
      { now: NOW },
    );
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.status).not.toBe(LegalTemporalEvaluationStatus.REPEALED);
    expect(result.repealChain).toBeNull();
  });
});
