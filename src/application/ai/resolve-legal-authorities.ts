import { detectExactCitation } from "@/engine/citation";
import {
  citationPinpointFromLocator,
  nullIfBlank,
} from "@/application/ai/legal-ai-citation";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import {
  CitationVerificationStatus,
  selectOfficiallyVerifiedAuthorities,
  verifyHintFromRetrieved,
  type LegalCitationVerdict,
  type LegalCorpusAuthority,
  type LegalCorpusRetrieveResult,
} from "@/application/ai/legal-corpus";

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
const MAX_QUESTION_HITS = 6;

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

  const retrieved = await input.retriever.retrieveLegalQuestion({
    question: input.question,
    query: input.question,
    locator: null,
  });

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
  const retrieved = await input.retriever.retrieveExactCitation({
    question: input.question,
    query: input.query,
    locator: input.locator,
  });

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

  const verification = await input.retriever.verifyCitation({
    question: input.question,
    query: input.query,
    ...verifyHintFromRetrieved(retrieved.authorities),
  });

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
