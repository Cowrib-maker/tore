/**
 * Generalizes FallbackLegalCorpusRetriever's local-then-remote pattern to
 * an arbitrary ordered list of tiers (local corpus → internal engine →
 * official web, in that order for production — see
 * create-legal-ai-service.ts). Each tier is tried in order; the first one
 * that actually retrieves something wins. A CONFLICT or an
 * as_of_unavailable result from an earlier tier is never silently
 * overridden by a later one — ambiguity or unproven temporal applicability
 * stays exactly that, it does not get "resolved" by trying a different
 * source.
 *
 * fallback-legal-corpus-retriever.ts is left completely unmodified (its
 * own tests keep validating the 2-tier case as-is); this is a separate,
 * additive composer for the 3-tier case.
 */
import type {
  LegalCitationVerifyResult,
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
  LegalCorpusSource,
  LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import { verifyHintFromRetrieved } from "@/application/ai/legal-corpus";

export type LegalCorpusTier = {
  retriever: LegalCorpusRetriever;
  source: LegalCorpusSource;
};

function hasRetrievedAuthorities(
  result: LegalCorpusRetrieveResult,
): result is Extract<LegalCorpusRetrieveResult, { kind: "retrieved" }> {
  return result.kind === "retrieved" && result.authorities.length > 0;
}

function withSource(
  result: LegalCorpusRetrieveResult,
  source: LegalCorpusSource,
): LegalCorpusRetrieveResult {
  if (result.kind !== "retrieved") {
    return result;
  }
  return { ...result, source };
}

function isMiss(result: LegalCitationVerifyResult): boolean {
  if (!result.ok) {
    return true;
  }
  return (
    result.verdict.status === "UNRESOLVED" &&
    (result.verdict.reasons.includes("citation_not_in_local_corpus") ||
      result.verdict.reasons.includes("not_found"))
  );
}

export class TieredLegalCorpusRetriever implements LegalCorpusRetriever {
  constructor(private readonly tiers: readonly LegalCorpusTier[]) {
    if (tiers.length === 0) {
      throw new Error("TieredLegalCorpusRetriever requires at least one tier");
    }
  }

  async retrieveExactCitation(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    for (const tier of this.tiers) {
      const result = await tier.retriever.retrieveExactCitation(input);
      if (result.kind === "as_of_unavailable") {
        return result;
      }
      if (hasRetrievedAuthorities(result)) {
        return withSource(result, tier.source);
      }
    }
    return { kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null };
  }

  async retrieveLegalQuestion(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    let lastUnavailable: LegalCorpusRetrieveResult | null = null;
    for (const tier of this.tiers) {
      const result = await tier.retriever.retrieveLegalQuestion(input);
      if (result.kind === "as_of_unavailable") {
        return result;
      }
      if (hasRetrievedAuthorities(result)) {
        return withSource(result, tier.source);
      }
      lastUnavailable = result;
    }
    return lastUnavailable ?? { kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null };
  }

  async verifyCitation(
    input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult> {
    let last: LegalCitationVerifyResult = { ok: false, reason: "not_found" };
    for (const tier of this.tiers) {
      last = await tier.retriever.verifyCitation(input);
      if (!isMiss(last)) {
        return last;
      }
    }
    return last;
  }

  /**
   * Single-pass retrieve+verify per tier when a tier supports it, mirroring
   * FallbackLegalCorpusRetriever's own optimization — falls back to the
   * ordinary two-call sequence for any tier that doesn't implement it.
   */
  async retrieveAndVerifyExactCitation(input: LegalCorpusRetrieveInput): Promise<{
    retrieved: LegalCorpusRetrieveResult;
    verification: LegalCitationVerifyResult;
  }> {
    let last: { retrieved: LegalCorpusRetrieveResult; verification: LegalCitationVerifyResult } = {
      retrieved: { kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null },
      verification: { ok: false, reason: "not_found" },
    };

    for (const tier of this.tiers) {
      const outcome = tier.retriever.retrieveAndVerifyExactCitation
        ? await tier.retriever.retrieveAndVerifyExactCitation(input)
        : await this.twoCallRetrieveAndVerify(tier.retriever, input);

      if (outcome.retrieved.kind === "as_of_unavailable") {
        return outcome;
      }
      if (hasRetrievedAuthorities(outcome.retrieved)) {
        return {
          retrieved: withSource(outcome.retrieved, tier.source),
          verification: outcome.verification,
        };
      }
      last = outcome;
    }
    return last;
  }

  private async twoCallRetrieveAndVerify(
    retriever: LegalCorpusRetriever,
    input: LegalCorpusRetrieveInput,
  ): Promise<{ retrieved: LegalCorpusRetrieveResult; verification: LegalCitationVerifyResult }> {
    const retrieved = await retriever.retrieveExactCitation(input);
    const verification = await retriever.verifyCitation({
      query: input.query,
      question: input.question,
      explicitRelations: input.explicitRelations,
      ...verifyHintFromRetrieved(retrieved.kind === "retrieved" ? retrieved.authorities : []),
    });
    return { retrieved, verification };
  }
}
