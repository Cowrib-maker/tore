import { detectExactCitation } from "@/engine/citation";
import {
  citationPinpointFromLocator,
  nullIfBlank,
} from "@/application/ai/legal-ai-citation";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import {
  CitationVerificationStatus,
  LegalCorpusSource,
  selectOfficiallyVerifiedAuthorities,
  verifyHintFromRetrieved,
  type LegalCitationVerdict,
  type LegalCitationVerifyResult,
  type LegalCorpusAuthority,
  type LegalCorpusRetrieveResult,
} from "@/application/ai/legal-corpus";
import {
  logLegalCorpusEvent,
  withLatency,
  type LegalCorpusLogOperation,
} from "@/infrastructure/observability/legal-corpus-metrics";

/**
 * HTTP/engine-only failure reasons — as opposed to `not_found` (local or
 * engine genuinely has nothing) or `not_configured` (engine intentionally
 * disabled), which are not failures. See LegalCorpusUnavailableReason in
 * legal-corpus.ts for the full set this is drawn from.
 */
const ENGINE_FAILURE_REASONS = new Set([
  "unauthorized",
  "server_error",
  "network",
  "invalid_response",
]);

/**
 * Logs a safe, PII-free summary of a retrieveExactCitation/retrieveLegalQuestion
 * outcome. Never touches the question text, authority excerpts, or any
 * document content carried on `retrieved` — only its kind/source/reason.
 */
function logRetrieveOutcome(
  operation: LegalCorpusLogOperation,
  retrieved: LegalCorpusRetrieveResult,
  latencyMs: number,
): void {
  if (retrieved.kind === "retrieved") {
    logLegalCorpusEvent({
      operation,
      outcome:
        retrieved.source === LegalCorpusSource.LEGAL_DATA_ENGINE
          ? "engine_success"
          : "local_fallback",
      source: retrieved.source,
      latencyMs,
    });
    return;
  }
  if (retrieved.kind === "as_of_unavailable") {
    logLegalCorpusEvent({ operation, outcome: "as_of_unavailable", latencyMs });
    return;
  }
  if (retrieved.reason === "timeout") {
    logLegalCorpusEvent({
      operation,
      outcome: "timeout",
      reason: retrieved.reason,
      latencyMs,
    });
  } else if (ENGINE_FAILURE_REASONS.has(retrieved.reason)) {
    logLegalCorpusEvent({
      operation,
      outcome: "engine_failure",
      reason: retrieved.reason,
      latencyMs,
    });
  } else if (retrieved.reason === "not_configured") {
    logLegalCorpusEvent({
      operation,
      outcome: "not_configured",
      reason: retrieved.reason,
      latencyMs,
    });
  } else {
    logLegalCorpusEvent({
      operation,
      outcome: "not_found",
      reason: retrieved.reason,
      latencyMs,
    });
  }
}

/** Logs a safe summary of a verifyCitation outcome — status only, never citation content. */
function logVerifyOutcome(
  verification: LegalCitationVerifyResult,
  latencyMs: number,
): void {
  if (!verification.ok) {
    logRetrieveOutcome(
      "verifyCitation",
      { kind: "unavailable", reason: verification.reason, authorities: [], retrievedAt: null },
      latencyMs,
    );
    return;
  }
  logLegalCorpusEvent({
    operation: "verifyCitation",
    outcome: "verification_result",
    verificationStatus: verification.verdict.status,
    latencyMs,
  });
}

export const MISSING_LEGAL_SOURCE_MESSAGE =
  "Холбогдох эрх зүйн зохицуулалт одоогоор баталгаатай эх сурвалжаас олдсонгүй.";

const UNVERIFIED_CITATION_MESSAGE =
  "Энэ заалтыг TORE-ийн баталгаатай эрх зүйн эх сурвалжаас одоогоор баталгаажуулж чадсангүй. Тиймээс заалтын агуулгыг таамгаар тайлбарлахгүй.";

const CONFLICT_CITATION_MESSAGE =
  "Энэ ишлэлийг нэг утгатай баталгаажуулж чадсангүй. Тиймээс аль эх нь хамаарахыг таамгаар сонгохгүй, заалтын агуулгыг таамгаар тайлбарлахгүй.";

const AS_OF_UNAVAILABLE_MESSAGE =
  "Тухайн үед хүчинтэй хувилбарыг баталгаажуулж чадсангүй. Тиймээс заалтын агуулгыг таамгаар тайлбарлахгүй.";

const ENGINE_UNAVAILABLE_MESSAGE =
  "Баталгаатай эрх зүйн эх сурвалжид одоогоор холбогдож чадсангүй. Тиймээс заалтын агуулгыг таамгаар тайлбарлахгүй.";

const VERIFIED_SOURCE_TYPE = "legal-data-engine";
const MAX_QUESTION_HITS = 3;

export type ResolvedLegalAuthority = {
  title: string;
  locator: string;
  excerpt: string;
  documentId: string;
  documentVersionId: string;
  nodeId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceUrl: string | null;
  sourceVersion: string | null;
  article: string | null;
  paragraph: string | null;
  sourceType: string;
};

export type ResolveLegalAuthoritiesResult =
  | {
      kind: "verified";
      source: "exact" | "question";
      authorities: ResolvedLegalAuthority[];
      retrievalInvoked: true;
    }
  | {
      kind: "refused";
      message: string;
      retrievalInvoked: true;
    }
  | {
      kind: "empty";
      reason:
        | "not_found"
        | "unavailable"
        | "as_of_unavailable"
        | "unverified";
      retrievalInvoked: boolean;
    };

/**
 * Exact statute pinpoints still require unique official verification.
 * Open legal questions use provenance-filtered article search and never
 * invent missing provisions.
 */
export async function resolveLegalAuthorities(input: {
  question: string;
  retriever: LegalCorpusRetriever;
  requireRetrieval: boolean;
}): Promise<ResolveLegalAuthoritiesResult> {
  if (!input.requireRetrieval) {
    return { kind: "empty", reason: "not_found", retrievalInvoked: false };
  }

  const exact = detectExactCitation(input.question);
  if (exact) {
    return resolveExactCitation({
      question: input.question,
      query: exact.query,
      locator: exact.locator,
      retriever: input.retriever,
    });
  }

  const { result: retrieved, latencyMs: retrieveLegalQuestionLatencyMs } =
    await withLatency(() =>
      input.retriever.retrieveLegalQuestion({
        question: input.question,
        query: input.question,
        locator: null,
      }),
    );
  logRetrieveOutcome(
    "retrieveLegalQuestion",
    retrieved,
    retrieveLegalQuestionLatencyMs,
  );

  if (retrieved.kind === "as_of_unavailable") {
    return {
      kind: "empty",
      reason: "as_of_unavailable",
      retrievalInvoked: true,
    };
  }
  if (retrieved.kind === "unavailable") {
    return {
      kind: "empty",
      reason:
        retrieved.reason === "not_found" ? "not_found" : "unavailable",
      retrievalInvoked: true,
    };
  }
  if (retrieved.kind !== "retrieved" || retrieved.authorities.length === 0) {
    return { kind: "empty", reason: "not_found", retrievalInvoked: true };
  }

  const authorities = retrieved.authorities
    .slice(0, MAX_QUESTION_HITS)
    .map(toResolvedAuthority);

  return {
    kind: "verified",
    source: "question",
    authorities,
    retrievalInvoked: true,
  };
}

async function resolveExactCitation(input: {
  question: string;
  query: string;
  locator: string | null;
  retriever: LegalCorpusRetriever;
}): Promise<ResolveLegalAuthoritiesResult> {
  // Bind to the retriever instance before detaching — this is a method
  // reference, and calling it as a bare function (as the `combined(...)`
  // call below does) would otherwise run with `this` undefined.
  // Bind to the retriever instance before detaching — this is a method
  // reference, and calling it as a bare function (as the `combined(...)`
  // call below does) would otherwise run with `this` undefined.
  const combined = input.retriever.retrieveAndVerifyExactCitation?.bind(
    input.retriever,
  );

  let retrieved: LegalCorpusRetrieveResult;
  let verification: LegalCitationVerifyResult;

  if (combined) {
    // Single-pass path: retriever can derive both outputs from one lookup
    // instead of the two independent calls below running the same search
    // twice (see KnowledgeLegalCorpusRetriever.retrieveAndVerifyExactCitation).
    const { result, latencyMs } = await withLatency(() =>
      combined({
        question: input.question,
        query: input.query,
        locator: input.locator,
      }),
    );
    retrieved = result.retrieved;
    verification = result.verification;
    logRetrieveOutcome("retrieveExactCitation", retrieved, latencyMs);
    if (retrieved.kind === "retrieved") {
      logVerifyOutcome(verification, 0);
    }
  } else {
    const { result, latencyMs: retrieveExactCitationLatencyMs } =
      await withLatency(() =>
        input.retriever.retrieveExactCitation({
          question: input.question,
          query: input.query,
          locator: input.locator,
        }),
      );
    retrieved = result;
    logRetrieveOutcome(
      "retrieveExactCitation",
      retrieved,
      retrieveExactCitationLatencyMs,
    );

    if (retrieved.kind === "retrieved") {
      const { result: verifyResult, latencyMs: verifyCitationLatencyMs } =
        await withLatency(() =>
          input.retriever.verifyCitation({
            question: input.question,
            query: input.query,
            ...verifyHintFromRetrieved(retrieved.authorities),
          }),
        );
      verification = verifyResult;
      logVerifyOutcome(verification, verifyCitationLatencyMs);
    } else {
      // No verification call needed — retrieval already refused/unavailable;
      // the shared refusal check below handles this from `retrieved` alone.
      verification = { ok: false, reason: "not_found" };
    }
  }

  const retrieveRefusal = retrieveRefusalMessage(retrieved);
  if (retrieveRefusal) {
    return {
      kind: "refused",
      message: retrieveRefusal,
      retrievalInvoked: true,
    };
  }
  if (retrieved.kind !== "retrieved") {
    return {
      kind: "refused",
      message: ENGINE_UNAVAILABLE_MESSAGE,
      retrievalInvoked: true,
    };
  }

  if (!verification.ok) {
    return {
      kind: "refused",
      message: ENGINE_UNAVAILABLE_MESSAGE,
      retrievalInvoked: true,
    };
  }

  const verdictRefusal = verificationRefusalMessage(verification.verdict);
  if (verdictRefusal) {
    return {
      kind: "refused",
      message: verdictRefusal,
      retrievalInvoked: true,
    };
  }

  const verified = selectOfficiallyVerifiedAuthorities(
    retrieved.authorities,
    verification.verdict,
  );
  if (verified.length === 0) {
    return {
      kind: "refused",
      message: UNVERIFIED_CITATION_MESSAGE,
      retrievalInvoked: true,
    };
  }

  return {
    kind: "verified",
    source: "exact",
    authorities: verified.map(toResolvedAuthority),
    retrievalInvoked: true,
  };
}

function toResolvedAuthority(
  authority: LegalCorpusAuthority,
): ResolvedLegalAuthority {
  const pinpoint = citationPinpointFromLocator(authority.locator);
  return {
    title: authority.title,
    locator: authority.locator,
    excerpt: authority.excerpt,
    documentId: authority.documentId,
    documentVersionId: authority.documentVersionId,
    nodeId: authority.nodeId,
    effectiveFrom: authority.effectiveFrom,
    effectiveTo: authority.effectiveTo,
    sourceUrl: nullIfBlank(authority.sourceUrl),
    sourceVersion: nullIfBlank(authority.sourceVersion),
    article: nullIfBlank(authority.article) ?? pinpoint.article,
    paragraph: nullIfBlank(authority.paragraph) ?? pinpoint.paragraph,
    sourceType: authority.sourceType ?? VERIFIED_SOURCE_TYPE,
  };
}

function retrieveRefusalMessage(
  retrieved: LegalCorpusRetrieveResult,
): string | null {
  if (retrieved.kind === "as_of_unavailable") {
    return AS_OF_UNAVAILABLE_MESSAGE;
  }
  if (retrieved.kind === "unavailable") {
    return UNVERIFIED_CITATION_MESSAGE;
  }
  return null;
}

function verificationRefusalMessage(
  verdict: LegalCitationVerdict,
): string | null {
  if (verdict.status === CitationVerificationStatus.CONFLICT) {
    return CONFLICT_CITATION_MESSAGE;
  }
  if (verdict.status === CitationVerificationStatus.UNRESOLVED) {
    return UNVERIFIED_CITATION_MESSAGE;
  }
  return null;
}

export function missingSourceUserMessage(
  result: ResolveLegalAuthoritiesResult,
): string | null {
  if (result.kind === "empty") {
    return MISSING_LEGAL_SOURCE_MESSAGE;
  }
  return null;
}
