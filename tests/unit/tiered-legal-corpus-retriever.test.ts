import { describe, expect, it, vi } from "vitest";

import { TieredLegalCorpusRetriever } from "@/application/ai/tiered-legal-corpus-retriever";
import {
  LegalCorpusSource,
  type LegalCitationVerifyResult,
  type LegalCorpusRetriever,
  type LegalCorpusRetrieveInput,
  type LegalCorpusRetrieveResult,
  type LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";

function authority(id: string) {
  return {
    nodeId: `${id}-node`,
    documentId: `${id}-doc`,
    documentVersionId: `${id}-ver`,
    locator: "art-1",
    title: `${id} title`,
    excerpt: `${id} excerpt`,
    contentHash: "n",
    sourceContentHash: "s",
    parserId: "test",
    archiveRecordId: `arch-${id}`,
    effectiveFrom: null,
    effectiveTo: null,
  };
}

const MISS: LegalCorpusRetrieveResult = {
  kind: "unavailable",
  reason: "not_found",
  authorities: [],
  retrievedAt: null,
};

function hit(id: string): LegalCorpusRetrieveResult {
  return { kind: "retrieved", status: "ok", authorities: [authority(id)], retrievedAt: "t" };
}

class StubRetriever implements LegalCorpusRetriever {
  calls = { retrieveExactCitation: 0, retrieveLegalQuestion: 0, verifyCitation: 0 };
  constructor(
    private readonly retrieveResult: LegalCorpusRetrieveResult,
    private readonly verifyResult: LegalCitationVerifyResult = { ok: false, reason: "not_found" },
  ) {}
  async retrieveExactCitation(_input: LegalCorpusRetrieveInput) {
    this.calls.retrieveExactCitation += 1;
    return this.retrieveResult;
  }
  async retrieveLegalQuestion(_input: LegalCorpusRetrieveInput) {
    this.calls.retrieveLegalQuestion += 1;
    return this.retrieveResult;
  }
  async verifyCitation(_input: LegalCorpusVerifyInput) {
    this.calls.verifyCitation += 1;
    return this.verifyResult;
  }
}

describe("TieredLegalCorpusRetriever.retrieveExactCitation", () => {
  it("falls through local -> engine -> official web, stamping the tier that actually hit", async () => {
    const local = new StubRetriever(MISS);
    const engine = new StubRetriever(MISS);
    const web = new StubRetriever(hit("web"));
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: local, source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: engine, source: LegalCorpusSource.LEGAL_DATA_ENGINE },
      { retriever: web, source: LegalCorpusSource.OFFICIAL_WEB },
    ]);

    const result = await tiered.retrieveExactCitation({ question: "q", query: "q", locator: null });

    expect(local.calls.retrieveExactCitation).toBe(1);
    expect(engine.calls.retrieveExactCitation).toBe(1);
    expect(web.calls.retrieveExactCitation).toBe(1);
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.source).toBe(LegalCorpusSource.OFFICIAL_WEB);
    }
  });

  it("short-circuits on the first hit and never reaches later tiers", async () => {
    const local = new StubRetriever(hit("local"));
    const engine = new StubRetriever(MISS);
    const web = new StubRetriever(MISS);
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: local, source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: engine, source: LegalCorpusSource.LEGAL_DATA_ENGINE },
      { retriever: web, source: LegalCorpusSource.OFFICIAL_WEB },
    ]);

    const result = await tiered.retrieveExactCitation({ question: "q", query: "q", locator: null });

    expect(engine.calls.retrieveExactCitation).toBe(0);
    expect(web.calls.retrieveExactCitation).toBe(0);
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.source).toBe(LegalCorpusSource.LOCAL_CORPUS);
    }
  });

  it("returns unavailable when every tier misses", async () => {
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: new StubRetriever(MISS), source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: new StubRetriever(MISS), source: LegalCorpusSource.LEGAL_DATA_ENGINE },
      { retriever: new StubRetriever(MISS), source: LegalCorpusSource.OFFICIAL_WEB },
    ]);
    const result = await tiered.retrieveExactCitation({ question: "q", query: "q", locator: null });
    expect(result).toEqual(MISS);
  });

  it("short-circuits on as_of_unavailable from an early tier — never asks a later tier to resolve it", async () => {
    const asOf: LegalCorpusRetrieveResult = { kind: "as_of_unavailable", authorities: [], retrievedAt: null };
    const local = new StubRetriever(asOf);
    const web = new StubRetriever(hit("web"));
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: local, source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: web, source: LegalCorpusSource.OFFICIAL_WEB },
    ]);

    const result = await tiered.retrieveExactCitation({ question: "q", query: "q", locator: null });
    expect(result).toEqual(asOf);
    expect(web.calls.retrieveExactCitation).toBe(0);
  });
});

describe("TieredLegalCorpusRetriever.verifyCitation", () => {
  it("does not treat a CONFLICT as a miss — never asks a later tier to silently resolve ambiguity", async () => {
    const conflict: LegalCitationVerifyResult = {
      ok: true,
      verdict: { query: "q", status: "CONFLICT", nodeId: null, documentVersionId: null, locator: null, reasons: ["multiple_candidates"] },
    };
    const local = new StubRetriever(MISS, conflict);
    const web = new StubRetriever(MISS);
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: local, source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: web, source: LegalCorpusSource.OFFICIAL_WEB },
    ]);

    const result = await tiered.verifyCitation({ query: "q" });
    expect(result).toEqual(conflict);
    expect(web.calls.verifyCitation).toBe(0);
  });

  it("falls through to the next tier on an UNRESOLVED local miss", async () => {
    const unresolved: LegalCitationVerifyResult = {
      ok: true,
      verdict: { query: "q", status: "UNRESOLVED", nodeId: null, documentVersionId: null, locator: null, reasons: ["citation_not_in_local_corpus"] },
    };
    const valid: LegalCitationVerifyResult = {
      ok: true,
      verdict: { query: "q", status: "VALID", nodeId: "web-node", documentVersionId: "web-ver", locator: "art-1", reasons: ["legalinfo_live_verified"] },
    };
    const local = new StubRetriever(MISS, unresolved);
    const web = new StubRetriever(MISS, valid);
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: local, source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: web, source: LegalCorpusSource.OFFICIAL_WEB },
    ]);

    const result = await tiered.verifyCitation({ query: "q" });
    expect(result).toEqual(valid);
  });
});

describe("TieredLegalCorpusRetriever.retrieveAndVerifyExactCitation", () => {
  it("uses a tier's combined method when available, and falls through to the next tier on a miss", async () => {
    const combinedMiss = vi.fn(async () => ({ retrieved: MISS, verification: { ok: false as const, reason: "not_found" as const } }));
    class CombinedMissRetriever extends StubRetriever {
      retrieveAndVerifyExactCitation = combinedMiss;
    }
    const combinedHit = vi.fn(async () => ({
      retrieved: hit("web"),
      verification: {
        ok: true as const,
        verdict: { query: "q", status: "VALID" as const, nodeId: "web-node", documentVersionId: "web-ver", locator: "art-1", reasons: ["legalinfo_live_verified"] },
      },
    }));
    class CombinedHitRetriever extends StubRetriever {
      retrieveAndVerifyExactCitation = combinedHit;
    }
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: new CombinedMissRetriever(MISS), source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: new CombinedHitRetriever(hit("web")), source: LegalCorpusSource.OFFICIAL_WEB },
    ]);

    const result = await tiered.retrieveAndVerifyExactCitation({ question: "q", query: "q", locator: null });
    expect(combinedMiss).toHaveBeenCalledTimes(1);
    expect(combinedHit).toHaveBeenCalledTimes(1);
    expect(result.retrieved.kind).toBe("retrieved");
    if (result.retrieved.kind === "retrieved") {
      expect(result.retrieved.source).toBe(LegalCorpusSource.OFFICIAL_WEB);
    }
    expect(result.verification.ok).toBe(true);
  });

  it("falls back to the two-call sequence for a tier with no combined method", async () => {
    const local = new StubRetriever(MISS);
    const web = new StubRetriever(hit("web"), {
      ok: true,
      verdict: { query: "q", status: "VALID", nodeId: "web-node", documentVersionId: "web-ver", locator: "art-1", reasons: ["legalinfo_live_verified"] },
    });
    const tiered = new TieredLegalCorpusRetriever([
      { retriever: local, source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: web, source: LegalCorpusSource.OFFICIAL_WEB },
    ]);

    const result = await tiered.retrieveAndVerifyExactCitation({ question: "q", query: "q", locator: null });
    expect(web.calls.retrieveExactCitation).toBe(1);
    expect(web.calls.verifyCitation).toBe(1);
    expect(result.retrieved.kind).toBe("retrieved");
    if (result.retrieved.kind === "retrieved") {
      expect(result.retrieved.source).toBe(LegalCorpusSource.OFFICIAL_WEB);
    }
  });
});

describe("TieredLegalCorpusRetriever construction", () => {
  it("throws when given no tiers", () => {
    expect(() => new TieredLegalCorpusRetriever([])).toThrow();
  });
});
