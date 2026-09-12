import { describe, expect, it, vi } from "vitest";

import {
  MISSING_LEGAL_SOURCE_MESSAGE,
  missingSourceUserMessage,
  resolveLegalAuthorities,
} from "@/application/ai/resolve-legal-authorities";
import {
  LegalCorpusSource,
  type LegalCitationVerifyResult,
  type LegalCorpusRetriever,
  type LegalCorpusRetrieveInput,
  type LegalCorpusRetrieveResult,
  type LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";

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
    }
    expect(retriever.verifyCitationCalls).toBe(0);
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
