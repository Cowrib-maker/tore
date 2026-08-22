import type { LegalTemporalExplicitRelation } from "@/engine/knowledge";

export const CitationVerificationStatus = {
  VALID: "VALID",
  UNRESOLVED: "UNRESOLVED",
  CONFLICT: "CONFLICT",
} as const;

export type CitationVerificationStatus =
  (typeof CitationVerificationStatus)[keyof typeof CitationVerificationStatus];

export type LegalCorpusAuthority = {
  nodeId: string;
  documentId: string;
  documentVersionId: string;
  locator: string;
  title: string;
  excerpt: string;
  contentHash: string;
  sourceContentHash: string;
  parserId: string;
  archiveRecordId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** Official source URL when known. Never invent a missing URL. */
  sourceUrl?: string | null;
  sourceVersion?: string | null;
  article?: string | null;
  paragraph?: string | null;
  sourceType?: string;
};

export type LegalCorpusUnavailableReason =
  | "timeout"
  | "unauthorized"
  | "server_error"
  | "network"
  | "not_configured"
  | "invalid_response"
  | "not_found";

export type LegalCorpusRetrieveResult =
  | {
      kind: "retrieved";
      status: "ok" | "placeholder";
      authorities: LegalCorpusAuthority[];
      retrievedAt: string;
    }
  | {
      kind: "as_of_unavailable";
      authorities: [];
      retrievedAt: string | null;
    }
  | {
      kind: "unavailable";
      reason: LegalCorpusUnavailableReason;
      authorities: [];
      retrievedAt: null;
    };

export type LegalCitationVerdict = {
  query: string;
  status: CitationVerificationStatus;
  nodeId: string | null;
  documentVersionId: string | null;
  locator: string | null;
  reasons: string[];
};

export type LegalCitationVerifyResult =
  | { ok: true; verdict: LegalCitationVerdict }
  | { ok: false; reason: LegalCorpusUnavailableReason };

export type LegalCorpusRetrieveInput = {
  question: string;
  query: string;
  locator: string | null;
  /** Caller-supplied relations only. Never inferred from titles. */
  explicitRelations?: readonly LegalTemporalExplicitRelation[];
};

export type LegalCorpusVerifyInput = {
  query: string;
  /** Full user message when available; required to preserve as-of intent. */
  question?: string;
  nodeId?: string | null;
  documentId?: string | null;
  locator?: string | null;
  explicitRelations?: readonly LegalTemporalExplicitRelation[];
};

/**
 * Application port for exact-citation corpus lookup and official verification.
 * Production talks to tore-legal-data-engine over HTTP.
 */
export interface LegalCorpusRetriever {
  retrieveExactCitation(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult>;
  verifyCitation(
    input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult>;
}

/**
 * Maps retrieve HTTP shape only. Never declares a citation VALID.
 * Official validity comes from POST /v1/citations/verify.
 */
export function inspectRetrieveShape(input: {
  status: string;
  authorities: LegalCorpusAuthority[];
  retrievedAt: string;
}): LegalCorpusRetrieveResult {
  if (input.status === "AS_OF_UNAVAILABLE") {
    return {
      kind: "as_of_unavailable",
      authorities: [],
      retrievedAt: input.retrievedAt,
    };
  }

  return {
    kind: "retrieved",
    status: input.status === "placeholder" ? "placeholder" : "ok",
    authorities: input.authorities,
    retrievedAt: input.retrievedAt,
  };
}

export function selectOfficiallyVerifiedAuthorities(
  authorities: readonly LegalCorpusAuthority[],
  verdict: LegalCitationVerdict,
): LegalCorpusAuthority[] {
  if (verdict.status !== CitationVerificationStatus.VALID || !verdict.nodeId) {
    return [];
  }

  return authorities.filter((item) => {
    if (item.nodeId !== verdict.nodeId) {
      return false;
    }
    if (
      verdict.documentVersionId &&
      item.documentVersionId !== verdict.documentVersionId
    ) {
      return false;
    }
    return true;
  });
}

export function verifyHintFromRetrieved(
  authorities: readonly LegalCorpusAuthority[],
): Pick<LegalCorpusVerifyInput, "nodeId" | "documentId" | "locator"> {
  if (authorities.length !== 1 || !authorities[0]) {
    return {};
  }
  const [authority] = authorities;
  return {
    nodeId: authority.nodeId,
    documentId: authority.documentId,
    locator: authority.locator,
  };
}
