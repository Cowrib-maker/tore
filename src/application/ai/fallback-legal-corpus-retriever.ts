import type {
  LegalCitationVerifyResult,
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
  LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import {
  LegalCorpusSource,
  verifyHintFromRetrieved,
} from "@/application/ai/legal-corpus";

function hasRetrievedAuthorities(
  result: LegalCorpusRetrieveResult,
): result is Extract<LegalCorpusRetrieveResult, { kind: "retrieved" }> {
  return result.kind === "retrieved" && result.authorities.length > 0;
}

/**
 * Stamps which retriever produced a "retrieved" result. Other result kinds
 * ("as_of_unavailable" / "unavailable") carry no authorities to attribute,
 * so they pass through unchanged.
 */
function withSource(
  result: LegalCorpusRetrieveResult,
  source: LegalCorpusSource,
): LegalCorpusRetrieveResult {
  if (result.kind !== "retrieved") {
    return result;
  }
  return { ...result, source };
}

function isLocalMiss(result: LegalCitationVerifyResult): boolean {
  if (!result.ok) {
    return true;
  }
  return (
    result.verdict.status === "UNRESOLVED" &&
    result.verdict.reasons.includes("citation_not_in_local_corpus")
  );
}

/**
 * Tries in-process structured knowledge first, then the external engine.
 * Does not invent statutes. Does not convert unverified local hits into VALID.
 * Does not fall back to a remote "current" scrape when local temporal
 * applicability is UNKNOWN.
 */
export class FallbackLegalCorpusRetriever implements LegalCorpusRetriever {
  constructor(
    private readonly local: LegalCorpusRetriever,
    private readonly remote: LegalCorpusRetriever,
  ) {}

  async retrieveExactCitation(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    const local = await this.local.retrieveExactCitation(input);
    if (local.kind === "as_of_unavailable") {
      return local;
    }
    if (hasRetrievedAuthorities(local)) {
      return withSource(local, LegalCorpusSource.FALLBACK_LOCAL_CORPUS);
    }
    const remote = await this.remote.retrieveExactCitation(input);
    return withSource(remote, LegalCorpusSource.LEGAL_DATA_ENGINE);
  }
  async retrieveLegalQuestion(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    const local = await this.local.retrieveLegalQuestion(input);

    if (local.kind === "as_of_unavailable") {
      return local;
    }

    if (hasRetrievedAuthorities(local)) {
      return withSource(local, LegalCorpusSource.FALLBACK_LOCAL_CORPUS);
    }

    // Local Prisma corpus was queried — do not wait on remote engine timeouts.
    if (local.kind === "unavailable") {
      return local;
    }

    const remote = await this.remote.retrieveLegalQuestion(input);
    return withSource(remote, LegalCorpusSource.LEGAL_DATA_ENGINE);
  }
  async verifyCitation(
    input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult> {
    const local = await this.local.verifyCitation(input);
    if (!isLocalMiss(local)) {
      return local;
    }
    return this.remote.verifyCitation(input);
  }

  /**
   * Single-pass retrieve+verify when the wrapped local retriever supports
   * it (see LegalCorpusRetriever.retrieveAndVerifyExactCitation). Falls
   * back to the ordinary two-call sequence — each already local-then-remote
   * aware — when it does not, so behavior for any retriever without the
   * optimization is completely unchanged.
   */
  async retrieveAndVerifyExactCitation(input: LegalCorpusRetrieveInput): Promise<{
    retrieved: LegalCorpusRetrieveResult;
    verification: LegalCitationVerifyResult;
  }> {
    if (!this.local.retrieveAndVerifyExactCitation) {
      const retrieved = await this.retrieveExactCitation(input);
      const verification = await this.verifyCitation({
        query: input.query,
        question: input.question,
        explicitRelations: input.explicitRelations,
        ...verifyHintFromRetrieved(
          retrieved.kind === "retrieved" ? retrieved.authorities : [],
        ),
      });
      return { retrieved, verification };
    }

    const local = await this.local.retrieveAndVerifyExactCitation(input);
    if (local.retrieved.kind === "as_of_unavailable") {
      return local;
    }
    if (hasRetrievedAuthorities(local.retrieved)) {
      return {
        retrieved: withSource(
          local.retrieved,
          LegalCorpusSource.FALLBACK_LOCAL_CORPUS,
        ),
        verification: local.verification,
      };
    }

    // Local missed — fall through to remote for both steps, matching the
    // existing local-then-remote behavior of the separate calls above.
    const remoteRetrieved = await this.remote.retrieveExactCitation(input);
    const remoteVerification = await this.remote.verifyCitation({
      query: input.query,
      question: input.question,
      explicitRelations: input.explicitRelations,
      ...verifyHintFromRetrieved(
        remoteRetrieved.kind === "retrieved" ? remoteRetrieved.authorities : [],
      ),
    });
    return {
      retrieved: withSource(remoteRetrieved, LegalCorpusSource.LEGAL_DATA_ENGINE),
      verification: remoteVerification,
    };
  }
}
