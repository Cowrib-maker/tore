import { describe, expect, it, vi } from "vitest";

import { FallbackLegalCorpusRetriever } from "@/application/ai/fallback-legal-corpus-retriever";
import {
  LegalCorpusSource,
  type LegalCitationVerifyResult,
  type LegalCorpusRetriever,
  type LegalCorpusRetrieveInput,
  type LegalCorpusRetrieveResult,
  type LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import { LegalDataEngineClient } from "@/infrastructure/legal-data-engine/legal-data-engine-client";
import { HttpLegalCorpusRetriever } from "@/infrastructure/legal-data-engine/http-legal-corpus-retriever";

const localAuthority = {
  nodeId: "local-node",
  documentId: "local-doc",
  documentVersionId: "local-ver",
  locator: "art-1",
  title: "Local title",
  excerpt: "local excerpt",
  contentHash: "n",
  sourceContentHash: "s",
  parserId: "legalinfo-html-v1",
  archiveRecordId: "arch-local",
  effectiveFrom: "2017-07-01T00:00:00.000Z",
  effectiveTo: null,
};

const remoteAuthority = {
  nodeId: "remote-node",
  documentId: "remote-doc",
  documentVersionId: "remote-ver",
  locator: "art-2",
  title: "Remote title",
  excerpt: "remote excerpt",
  contentHash: "n",
  sourceContentHash: "s",
  parserId: "legalinfo-html-v1",
  archiveRecordId: "arch-remote",
  effectiveFrom: "2017-07-01T00:00:00.000Z",
  effectiveTo: null,
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function httpRetrieverWithFetch(fetchImpl: typeof fetch): HttpLegalCorpusRetriever {
  const client = new LegalDataEngineClient({
    baseUrl: "http://engine.test",
    serviceToken: "secret-token",
    fetchImpl,
  });
  return new HttpLegalCorpusRetriever(client);
}

/**
 * Stand-in for the local (Prisma-backed) retriever's actual contract: it
 * either finds at least one authority ("retrieved" with a non-empty array)
 * or reports "unavailable" — it never returns "retrieved" with an empty
 * authorities array. This mirrors KnowledgeLegalCorpusRetriever's real
 * behavior without depending on a database in this unit test.
 */
class StubLocalRetriever implements LegalCorpusRetriever {
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
    return this.retrieveResult;
  }
  async retrieveLegalQuestion(
    _input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    return this.retrieveResult;
  }
  async verifyCitation(
    _input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult> {
    return this.verifyResult;
  }
}

const localHit: LegalCorpusRetrieveResult = {
  kind: "retrieved",
  status: "ok",
  authorities: [localAuthority],
  retrievedAt: "2026-08-17T00:00:00.000Z",
};

const localMiss: LegalCorpusRetrieveResult = {
  kind: "unavailable",
  reason: "not_found",
  authorities: [],
  retrievedAt: null,
};

describe("FallbackLegalCorpusRetriever.retrieveExactCitation", () => {
  it("stamps FALLBACK_LOCAL_CORPUS on a local hit and never calls remote", async () => {
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localHit),
      remote,
    );

    const result = await fallback.retrieveExactCitation({
      question: "q",
      query: "q",
      locator: "art-1",
    });

    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.source).toBe(LegalCorpusSource.FALLBACK_LOCAL_CORPUS);
      expect(result.authorities).toEqual([localAuthority]);
    }
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it("falls back to the engine on a local miss and stamps LEGAL_DATA_ENGINE", async () => {
    const remoteFetch = vi.fn(async () =>
      jsonResponse(200, {
        authorities: [remoteAuthority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
        status: "ok",
      }),
    );
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localMiss),
      remote,
    );

    const result = await fallback.retrieveExactCitation({
      question: "q",
      query: "q",
      locator: "art-2",
    });

    expect(remoteFetch).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.source).toBe(LegalCorpusSource.LEGAL_DATA_ENGINE);
      expect(result.authorities).toEqual([remoteAuthority]);
    }
  });

  it("passes through a safe unavailable result when the engine is unreachable", async () => {
    const remoteFetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED secret-token");
    });
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localMiss),
      remote,
    );

    const result = await fallback.retrieveExactCitation({
      question: "q",
      query: "q",
      locator: "art-2",
    });

    expect(result).toEqual({
      kind: "unavailable",
      reason: "network",
      authorities: [],
      retrievedAt: null,
    });
  });

  it("does not call remote and returns as_of_unavailable unchanged", async () => {
    const asOfUnavailable: LegalCorpusRetrieveResult = {
      kind: "as_of_unavailable",
      authorities: [],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    };
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(asOfUnavailable),
      remote,
    );

    const result = await fallback.retrieveExactCitation({
      question: "q",
      query: "q",
      locator: "art-1",
    });

    expect(result).toEqual(asOfUnavailable);
    expect(remoteFetch).not.toHaveBeenCalled();
  });
});

describe("FallbackLegalCorpusRetriever.retrieveLegalQuestion — open-question safety (P0-2A invariant)", () => {
  it("stamps FALLBACK_LOCAL_CORPUS on a local hit and never calls the remote engine", async () => {
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localHit),
      remote,
    );

    const result = await fallback.retrieveLegalQuestion({
      question: "Ямар эрх зүйн зохицуулалт байдаг вэ?",
      query: "Ямар эрх зүйн зохицуулалт байдаг вэ?",
      locator: null,
    });

    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.source).toBe(LegalCorpusSource.FALLBACK_LOCAL_CORPUS);
    }
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it("on a local miss, returns the local unavailable result directly and never calls the remote engine", async () => {
    // Critical P0-2A invariant: the engine cannot serve open-question
    // retrieval today (no bare-`question` branch server-side), so a normal
    // free-text legal question must stay local-only even when local misses.
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localMiss),
      remote,
    );

    const result = await fallback.retrieveLegalQuestion({
      question: "Ямар эрх зүйн зохицуулалт байдаг вэ?",
      query: "Ямар эрх зүйн зохицуулалт байдаг вэ?",
      locator: null,
    });

    expect(result).toEqual(localMiss);
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it("does not call remote and returns as_of_unavailable unchanged", async () => {
    const asOfUnavailable: LegalCorpusRetrieveResult = {
      kind: "as_of_unavailable",
      authorities: [],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    };
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(asOfUnavailable),
      remote,
    );

    const result = await fallback.retrieveLegalQuestion({
      question: "q",
      query: "q",
      locator: null,
    });

    expect(result).toEqual(asOfUnavailable);
    expect(remoteFetch).not.toHaveBeenCalled();
  });
});

describe("FallbackLegalCorpusRetriever.verifyCitation — fail-closed behavior", () => {
  it("returns a local VALID verdict without calling remote", async () => {
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const localVerdict: LegalCitationVerifyResult = {
      ok: true,
      verdict: {
        query: "q",
        status: "VALID",
        nodeId: "local-node",
        documentVersionId: "local-ver",
        locator: "art-1",
        reasons: ["citation_unique"],
      },
    };
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localMiss, localVerdict),
      remote,
    );

    const result = await fallback.verifyCitation({ query: "q", nodeId: "local-node" });

    expect(result).toEqual(localVerdict);
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it("does not treat a local CONFLICT as a miss — does not ask remote to resolve it", async () => {
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const localConflict: LegalCitationVerifyResult = {
      ok: true,
      verdict: {
        query: "q",
        status: "CONFLICT",
        nodeId: null,
        documentVersionId: null,
        locator: null,
        reasons: ["multiple_candidates"],
      },
    };
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localMiss, localConflict),
      remote,
    );

    const result = await fallback.verifyCitation({ query: "q" });

    expect(result).toEqual(localConflict);
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it("falls back to remote when local reports the citation is not in the local corpus", async () => {
    const remoteFetch = vi.fn(async () =>
      jsonResponse(200, {
        results: [
          {
            query: "q",
            status: "VALID",
            nodeId: "remote-node",
            documentVersionId: "remote-ver",
            locator: "art-2",
            reasons: ["citation_unique"],
          },
        ],
      }),
    );
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const localUnresolvedMiss: LegalCitationVerifyResult = {
      ok: true,
      verdict: {
        query: "q",
        status: "UNRESOLVED",
        nodeId: null,
        documentVersionId: null,
        locator: null,
        reasons: ["citation_not_in_local_corpus"],
      },
    };
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localMiss, localUnresolvedMiss),
      remote,
    );

    const result = await fallback.verifyCitation({ query: "q" });

    expect(remoteFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      verdict: {
        query: "q",
        status: "VALID",
        nodeId: "remote-node",
        documentVersionId: "remote-ver",
        locator: "art-2",
        reasons: ["citation_unique"],
      },
    });
  });

  it("falls back to remote when the local retriever itself fails, and returns a safe failure if remote is also unreachable", async () => {
    const remoteFetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED secret-token");
    });
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const localFailure: LegalCitationVerifyResult = {
      ok: false,
      reason: "server_error",
    };
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localMiss, localFailure),
      remote,
    );

    const result = await fallback.verifyCitation({ query: "q" });

    expect(remoteFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, reason: "network" });
  });
});

describe("FallbackLegalCorpusRetriever.retrieveAndVerifyExactCitation (Sprint 14)", () => {
  it("falls back to two separate calls when the wrapped local retriever has no combined method, and behaves identically", async () => {
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const localVerify: LegalCitationVerifyResult = {
      ok: true,
      verdict: {
        query: "q",
        status: "VALID",
        nodeId: "local-node",
        documentVersionId: "local-ver",
        locator: "art-1",
        reasons: ["citation_unique", "local_provenance"],
      },
    };
    const fallback = new FallbackLegalCorpusRetriever(
      new StubLocalRetriever(localHit, localVerify),
      remote,
    );

    const result = await fallback.retrieveAndVerifyExactCitation({
      question: "q",
      query: "q",
      locator: "art-1",
    });

    expect(result.retrieved.kind).toBe("retrieved");
    if (result.retrieved.kind === "retrieved") {
      expect(result.retrieved.source).toBe(LegalCorpusSource.FALLBACK_LOCAL_CORPUS);
    }
    expect(result.verification).toEqual(localVerify);
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it("uses the local retriever's combined method (single lookup) when available, and never touches remote on a local hit", async () => {
    const remoteFetch = vi.fn();
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const combinedSpy = vi.fn(async () => ({
      retrieved: localHit,
      verification: {
        ok: true as const,
        verdict: {
          query: "q",
          status: "VALID" as const,
          nodeId: "local-node",
          documentVersionId: "local-ver",
          locator: "art-1",
          reasons: ["citation_unique", "local_provenance"],
        },
      },
    }));
    class CombinedStubLocalRetriever extends StubLocalRetriever {
      retrieveAndVerifyExactCitation = combinedSpy;
    }
    const fallback = new FallbackLegalCorpusRetriever(
      new CombinedStubLocalRetriever(localHit),
      remote,
    );

    const result = await fallback.retrieveAndVerifyExactCitation({
      question: "q",
      query: "q",
      locator: "art-1",
    });

    expect(combinedSpy).toHaveBeenCalledTimes(1);
    expect(result.retrieved.kind).toBe("retrieved");
    if (result.retrieved.kind === "retrieved") {
      expect(result.retrieved.source).toBe(LegalCorpusSource.FALLBACK_LOCAL_CORPUS);
    }
    expect(result.verification.ok).toBe(true);
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it("falls through to remote for both retrieve and verify when the local combined method misses", async () => {
    const remoteFetch = vi.fn(async () =>
      jsonResponse(200, {
        authorities: [remoteAuthority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
        status: "ok",
      }),
    );
    const remote = httpRetrieverWithFetch(remoteFetch as unknown as typeof fetch);
    const combinedSpy = vi.fn(async () => ({
      retrieved: localMiss,
      verification: { ok: true as const, verdict: {
        query: "q",
        status: "UNRESOLVED" as const,
        nodeId: null,
        documentVersionId: null,
        locator: null,
        reasons: ["citation_not_in_local_corpus"],
      } },
    }));
    class CombinedStubLocalRetriever extends StubLocalRetriever {
      retrieveAndVerifyExactCitation = combinedSpy;
    }
    const fallback = new FallbackLegalCorpusRetriever(
      new CombinedStubLocalRetriever(localMiss),
      remote,
    );

    const result = await fallback.retrieveAndVerifyExactCitation({
      question: "q",
      query: "q",
      locator: "art-2",
    });

    expect(combinedSpy).toHaveBeenCalledTimes(1);
    expect(result.retrieved.kind).toBe("retrieved");
    if (result.retrieved.kind === "retrieved") {
      expect(result.retrieved.source).toBe(LegalCorpusSource.LEGAL_DATA_ENGINE);
      expect(result.retrieved.authorities).toEqual([remoteAuthority]);
    }
  });
});
