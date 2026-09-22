import { describe, expect, it, vi } from "vitest";

import {
  MISSING_LEGAL_SOURCE_MESSAGE,
  missingSourceUserMessage,
  resolveLegalAuthorities,
} from "@/application/ai/resolve-legal-authorities";
import { FallbackLegalCorpusRetriever } from "@/application/ai/fallback-legal-corpus-retriever";
import {
  LegalCorpusSource,
  type LegalCitationVerifyResult,
  type LegalCorpusRetriever,
  type LegalCorpusRetrieveInput,
  type LegalCorpusRetrieveResult,
  type LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import {
  documentGraphId,
  provisionGraphId,
  GraphEdgeType,
  type AsyncGraphRepository,
  type GraphEdge,
  type GraphEdgeUpsertInput,
} from "@/engine/graph";

/** Minimal in-memory AsyncGraphRepository fake — proves the live integration seam actually works end-to-end. */
class FakeGraphRepository implements AsyncGraphRepository {
  private readonly edges: GraphEdge[] = [];
  outgoingForManyCalls = 0;

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
  async findNode() {
    return null;
  }
  async outgoing(nodeId: string) {
    return this.edges.filter((e) => e.fromId === nodeId);
  }
  async incoming(nodeId: string) {
    return this.edges.filter((e) => e.toId === nodeId);
  }
  async outgoingForMany(nodeIds: readonly string[]) {
    this.outgoingForManyCalls += 1;
    const idSet = new Set(nodeIds);
    return this.edges.filter((e) => idSet.has(e.fromId));
  }
  async neighbors() {
    return [];
  }
}

const authority = {
  nodeId: "node-1",
  documentId: "doc-1",
  documentVersionId: "ver-1",
  locator: "art-17/p-1",
  title: "Эрүүгийн хууль",
  excerpt: "excerpt",
  contentHash: "n",
  sourceContentHash: "s",
  parserId: "legalinfo-html-v1",
  archiveRecordId: "arch-1",
  effectiveFrom: "2017-07-01T00:00:00.000Z",
  effectiveTo: null,
};

const EXACT_CITATION_QUESTION = "Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?";
const OPEN_QUESTION = "Гэрлэлтээ цуцлахад ямар журам баримтална вэ?";

class StubRetriever implements LegalCorpusRetriever {
  retrieveExactCitationCalls = 0;
  retrieveLegalQuestionCalls = 0;
  verifyCitationCalls = 0;

  constructor(
    private readonly retrieveResult: LegalCorpusRetrieveResult,
    private readonly verifyResult: LegalCitationVerifyResult = {
      ok: false,
      reason: "not_found",
    },
  ) {}

  async retrieveExactCitation(
    _input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    this.retrieveExactCitationCalls += 1;
    return this.retrieveResult;
  }
  async retrieveLegalQuestion(
    _input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    this.retrieveLegalQuestionCalls += 1;
    return this.retrieveResult;
  }
  async verifyCitation(
    _input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult> {
    this.verifyCitationCalls += 1;
    return this.verifyResult;
  }
}

describe("resolveLegalAuthorities — exact citation grounding", () => {
  it("returns verified authorities on a VALID verdict and logs safe metadata", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const retriever = new StubRetriever(
      {
        kind: "retrieved",
        status: "ok",
        authorities: [authority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
        source: LegalCorpusSource.LEGAL_DATA_ENGINE,
      },
      {
        ok: true,
        verdict: {
          query: "17.1",
          status: "VALID",
          nodeId: "node-1",
          documentVersionId: "ver-1",
          locator: "art-17/p-1",
          reasons: ["citation_unique"],
        },
      },
    );

    const result = await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.source).toBe("exact");
      expect(result.authorities).toHaveLength(1);
      expect(result.authorities[0]?.nodeId).toBe("node-1");
    }

    const events = logSpy.mock.calls.map((call) => call[1]);
    for (const event of events) {
      const text = JSON.stringify(event);
      expect(text).not.toContain(EXACT_CITATION_QUESTION);
      expect(text.toLowerCase()).not.toContain("token");
      expect(text).not.toContain(authority.excerpt);
      expect(text).not.toContain(authority.title);
    }
    expect(events).toContainEqual(
      expect.objectContaining({
        operation: "retrieveExactCitation",
        outcome: "engine_success",
        source: LegalCorpusSource.LEGAL_DATA_ENGINE,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        operation: "verifyCitation",
        outcome: "verification_result",
        verificationStatus: "VALID",
      }),
    );

    logSpy.mockRestore();
  });

  it("resolves an exact citation through a retriever whose optional retrieveAndVerifyExactCitation relies on `this` (regression: detached-call `this` loss)", async () => {
    // Reproduces the real production shape: createCorpusRetriever() always
    // wraps the local/remote retrievers in FallbackLegalCorpusRetriever,
    // whose retrieveAndVerifyExactCitation reads `this.local`/`this.remote`.
    // resolveExactCitation() previously extracted that method as a bare
    // reference (`const combined = input.retriever.retrieveAndVerifyExactCitation`)
    // and invoked it detached (`combined(...)`), which runs with `this`
    // undefined and throws `Cannot read properties of undefined (reading
    // 'local')` before ever reaching local/remote lookup. A hand-written
    // StubRetriever without that optional method (as used elsewhere in this
    // file) can never exercise this path, since `combined` is simply
    // undefined for it — only a real FallbackLegalCorpusRetriever instance
    // reproduces the failure.
    const local = new StubRetriever(
      {
        kind: "retrieved",
        status: "ok",
        authorities: [authority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      },
      {
        ok: true,
        verdict: {
          query: "17.1",
          status: "VALID",
          nodeId: "node-1",
          documentVersionId: "ver-1",
          locator: "art-17/p-1",
          reasons: ["citation_unique"],
        },
      },
    );
    const remote = new StubRetriever({
      kind: "unavailable",
      reason: "not_found",
      authorities: [],
      retrievedAt: null,
    });
    const retriever = new FallbackLegalCorpusRetriever(local, remote);

    const result = await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.source).toBe("exact");
      expect(result.authorities).toHaveLength(1);
      expect(result.authorities[0]?.nodeId).toBe("node-1");
    }
    expect(local.retrieveExactCitationCalls).toBe(1);
    expect(local.verifyCitationCalls).toBe(1);
    expect(remote.retrieveExactCitationCalls).toBe(0);
  });

  it("refuses on CONFLICT without inventing which source applies", async () => {
    const retriever = new StubRetriever(
      {
        kind: "retrieved",
        status: "ok",
        authorities: [authority, { ...authority, nodeId: "node-2" }],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      },
      {
        ok: true,
        verdict: {
          query: "17.1",
          status: "CONFLICT",
          nodeId: null,
          documentVersionId: null,
          locator: null,
          reasons: ["multiple_candidates"],
        },
      },
    );

    const result = await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result).toMatchObject({ kind: "refused" });
    if (result.kind === "refused") {
      expect(result.message).toContain(
        "аль эх нь хамаарахыг таамгаар сонгохгүй",
      );
    }
  });

  it("refuses on UNRESOLVED without inventing content", async () => {
    const retriever = new StubRetriever(
      {
        kind: "retrieved",
        status: "ok",
        authorities: [authority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      },
      {
        ok: true,
        verdict: {
          query: "17.1",
          status: "UNRESOLVED",
          nodeId: null,
          documentVersionId: null,
          locator: null,
          reasons: ["citation_not_in_local_corpus"],
        },
      },
    );

    const result = await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result).toMatchObject({ kind: "refused" });
  });

  it("refuses when the engine is unavailable rather than answering from memory", async () => {
    const retriever = new StubRetriever({
      kind: "unavailable",
      reason: "network",
      authorities: [],
      retrievedAt: null,
    });

    const result = await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result).toMatchObject({ kind: "refused" });
    expect(retriever.verifyCitationCalls).toBe(0);
  });

  it("refuses as_of_unavailable without invoking verification", async () => {
    const retriever = new StubRetriever({
      kind: "as_of_unavailable",
      authorities: [],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });

    const result = await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result).toMatchObject({ kind: "refused" });
    expect(retriever.verifyCitationCalls).toBe(0);
  });

  it("refuses when verification itself fails (fail-closed, not fail-open)", async () => {
    const retriever = new StubRetriever(
      {
        kind: "retrieved",
        status: "ok",
        authorities: [authority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      },
      { ok: false, reason: "timeout" },
    );

    const result = await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result).toMatchObject({ kind: "refused" });
  });
});

describe("resolveLegalAuthorities — open question (local-only)", () => {
  it("returns local hits capped at 3 and never calls verifyCitation", async () => {
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [
        authority,
        { ...authority, nodeId: "n2" },
        { ...authority, nodeId: "n3" },
        { ...authority, nodeId: "n4" },
      ],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.source).toBe("question");
      expect(result.authorities).toHaveLength(3);
      expect(result.conflicts).toEqual([]);
    }
    expect(retriever.verifyCitationCalls).toBe(0);
  });

  it("conflicts is empty when no graphRepository is supplied — the default, unchanged behavior", async () => {
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [authority, { ...authority, nodeId: "n2" }],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.conflicts).toEqual([]);
    }
  });

  it("surfaces a real graph-backed conflict end-to-end when a graphRepository with an explicit REPEALS edge is supplied", async () => {
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [authority, { ...authority, nodeId: "n2" }],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });
    const graphRepository = new FakeGraphRepository();
    await graphRepository.upsertEdges([
      {
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: provisionGraphId(authority.documentId, "n2"),
        toNodeId: provisionGraphId(authority.documentId, authority.nodeId),
        fromLabel: "newer",
        toLabel: "older",
        sourceKind: "DOCUMENT_STRUCTURE",
        evidence: "art. 5",
      },
    ]);

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
      graphRepository,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({ type: "EXPLICIT_REPEALS", resolutionStatus: "RESOLVED" });
    }
    // one batched query for the whole set, not one per authority pair
    expect(graphRepository.outgoingForManyCalls).toBe(1);
  });

  it("degrades to no conflicts (never breaks the answer) if the graph repository throws", async () => {
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [authority, { ...authority, nodeId: "n2" }],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });
    const throwingRepository: AsyncGraphRepository = {
      upsertEdges: async () => ({ inserted: 0, updated: 0 }),
      findNode: async () => null,
      outgoing: async () => [],
      incoming: async () => [],
      outgoingForMany: async () => {
        throw new Error("simulated graph outage");
      },
      neighbors: async () => [],
    };

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
      graphRepository: throwingRepository,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.conflicts).toEqual([]);
      expect(result.authorities).toHaveLength(2);
      // outgoingForMany throwing (the conflict-detection path) does not
      // affect temporalValidity, which uses incoming() instead — still
      // computed normally here, since the fake's incoming() never throws.
      expect(result.authorities.every((a) => a.temporalValidity?.status === "UNKNOWN")).toBe(true);
    }
  });

  it("temporalValidity itself degrades to null (never breaks the answer) if the graph repository's incoming() throws", async () => {
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [authority],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });
    const throwingIncomingRepository: AsyncGraphRepository = {
      upsertEdges: async () => ({ inserted: 0, updated: 0 }),
      findNode: async () => null,
      outgoing: async () => [],
      incoming: async () => {
        throw new Error("simulated graph outage");
      },
      outgoingForMany: async () => [],
      neighbors: async () => [],
    };

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
      graphRepository: throwingIncomingRepository,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.authorities[0]!.temporalValidity).toBeNull();
    }
  });

  it("temporalValidity flags a SINGLE surfaced authority as REPEALED when the graph has an explicit repeal targeting its document — the gap a pairwise conflict check alone would miss", async () => {
    const repealedAuthority = { ...authority, documentId: "doc-old", nodeId: "n1" };
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [repealedAuthority],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });
    const graphRepository = new FakeGraphRepository();
    await graphRepository.upsertEdges([
      {
        edgeType: GraphEdgeType.REPEALS,
        fromNodeId: documentGraphId("doc-repealer"),
        toNodeId: documentGraphId("doc-old"),
        fromLabel: "repealer",
        toLabel: "old law",
        sourceKind: "LEGALINFO_REPEAL_DECLARATION",
        evidence: "real repeal declaration text",
      },
    ]);

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
      graphRepository,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.authorities).toHaveLength(1);
      expect(result.authorities[0]!.temporalValidity?.status).toBe("REPEALED");
      expect(result.authorities[0]!.temporalValidity?.evidence).toContain("real repeal declaration text");
      // a single authority never produces a pairwise conflict finding
      expect(result.conflicts).toEqual([]);
    }
  });

  it("temporalValidity is null (not fabricated) for an authority with no repeal evidence and no dates", async () => {
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [{ ...authority, documentId: "doc-untouched" }],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });
    const graphRepository = new FakeGraphRepository();

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
      graphRepository,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.authorities[0]!.temporalValidity?.status).toBe("UNKNOWN");
      expect(result.authorities[0]!.temporalValidity?.repealChain).toBeNull();
    }
  });

  it("returns empty (never invents) when nothing is found locally", async () => {
    const retriever = new StubRetriever({
      kind: "unavailable",
      reason: "not_found",
      authorities: [],
      retrievedAt: null,
    });

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(result).toMatchObject({ kind: "empty", reason: "not_found" });
    expect(missingSourceUserMessage(result)).toBe(MISSING_LEGAL_SOURCE_MESSAGE);
  });

  it("does not call retrieveExactCitation for an open question", async () => {
    const retriever = new StubRetriever({
      kind: "unavailable",
      reason: "not_found",
      authorities: [],
      retrievedAt: null,
    });

    await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    expect(retriever.retrieveExactCitationCalls).toBe(0);
    expect(retriever.retrieveLegalQuestionCalls).toBe(1);
  });

  it("short-circuits with an empty result and invokes no retrieval when requireRetrieval is false", async () => {
    const retriever = new StubRetriever({
      kind: "retrieved",
      status: "ok",
      authorities: [authority],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    });

    const result = await resolveLegalAuthorities({
      question: OPEN_QUESTION,
      retriever,
      requireRetrieval: false,
    });

    expect(result).toEqual({
      kind: "empty",
      reason: "not_found",
      retrievalInvoked: false,
    });
    expect(retriever.retrieveLegalQuestionCalls).toBe(0);
    expect(retriever.retrieveExactCitationCalls).toBe(0);
  });
});

describe("resolveLegalAuthorities — observability never logs sensitive content", () => {
  it("never logs the question text or verdict details on a refusal path", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const retriever = new StubRetriever(
      {
        kind: "retrieved",
        status: "ok",
        authorities: [authority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      },
      {
        ok: true,
        verdict: {
          query: EXACT_CITATION_QUESTION,
          status: "CONFLICT",
          nodeId: null,
          documentVersionId: null,
          locator: null,
          reasons: ["multiple_candidates"],
        },
      },
    );

    await resolveLegalAuthorities({
      question: EXACT_CITATION_QUESTION,
      retriever,
      requireRetrieval: true,
    });

    const events = logSpy.mock.calls.map((call) => call[1]);
    for (const event of events) {
      const text = JSON.stringify(event);
      expect(text).not.toContain(EXACT_CITATION_QUESTION);
    }
    expect(events).toContainEqual(
      expect.objectContaining({
        operation: "verifyCitation",
        outcome: "verification_result",
        verificationStatus: "CONFLICT",
      }),
    );

    logSpy.mockRestore();
  });
});
