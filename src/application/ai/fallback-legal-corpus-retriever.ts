import type {
  LegalCitationVerifyResult,
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
  LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import { LegalCorpusSource } from "@/application/ai/legal-corpus";

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
}
