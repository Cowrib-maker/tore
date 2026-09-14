/**
 * Formal source-provenance model for legal evidence — proposed as part of
 * the "authoritative legal source retrieval + web source fallback"
 * architecture audit.
 *
 * NOT wired into legal-ai.service.ts / resolve-legal-authorities.ts. The
 * live chat path today represents provenance informally (a bare
 * `sourceType?: string` on {@link LegalCorpusAuthority} /
 * {@link LegalAiSafeCitation}, defaulting to the literal
 * `"legal-data-engine"`) — see legal-corpus.ts and legal-ai-citation.ts.
 * That is a real, if narrow, gap: nothing stops two different call sites
 * from writing incompatible strings into the same field. This module
 * proposes the CLOSED, discriminated-union model the audit's Phase 4
 * asked for, so the next milestone that adds a new source class (court
 * decisions, official web) has an unrepresentable-by-construction type to
 * build on instead of another ad hoc string.
 *
 * Each variant below intentionally carries ONLY the fields that make
 * sense for that source class — this is what "source classes cannot be
 * silently mixed" means at the type level, not just at the value level:
 * a USER_DOCUMENT provenance cannot have a `url` field at all (uploaded
 * files aren't fetched from anywhere), a MODEL_KNOWLEDGE provenance
 * cannot claim a document/version identifier (there is no retrieval
 * behind it), and only OFFICIAL_WEB/SECONDARY_WEB carry a `url`.
 *
 * "Never expose raw internal locators" (the audit's Phase 4 instruction)
 * is enforced the same way the existing {@link LegalAiSafeCitation} type
 * already enforces it: {@link toLegalEvidenceProvenance} below is the
 * ONLY conversion path from the internal, hash/locator-bearing
 * {@link LegalCorpusAuthority} shape, and it deliberately drops
 * `nodeId`, `documentId` (internal id), `contentHash`, `sourceContentHash`,
 * `parserId`, and `archiveRecordId` — see its own doc comment.
 */

import type { LegalCorpusAuthority } from "@/application/ai/legal-corpus";

export const LegalEvidenceSourceType = {
  /** Retrieved from TORE's own local (Prisma-backed) corpus, or the
   * remote legal-data-engine, and passed official citation verification. */
  TORE_VERIFIED: "TORE_VERIFIED",
  /** A verified court/judgment decision entry. Not yet reachable in
   * practice — see docs/architecture/legal-source-retrieval-audit.md
   * Phase 2 for the schema gap this depends on. */
  COURT_DECISION: "COURT_DECISION",
  /** Live-fetched from a controlled-allowlist official domain (see
   * legal-web-research-provider.ts) when internal corpus coverage was
   * insufficient. Not yet reachable — no web fallback is wired in yet. */
  OFFICIAL_WEB: "OFFICIAL_WEB",
  /** Text extracted from a file the user uploaded to this conversation.
   * Evidence/fact material, never law — see untrusted-document.ts. */
  USER_DOCUMENT: "USER_DOCUMENT",
  /** A web source outside the official allowlist. Never authoritative;
   * exists only so a future web-fallback design has an explicit "this is
   * not official" bucket instead of silently dropping such results. */
  SECONDARY_WEB: "SECONDARY_WEB",
  /** No retrieval backs this content at all — the model's own parametric
   * knowledge. Always UNVERIFIED; see {@link LegalEvidenceProvenance}. */
  MODEL_KNOWLEDGE: "MODEL_KNOWLEDGE",
  /** Something was retrieved but did not pass verification (e.g. a
   * CONFLICT or UNRESOLVED citation verdict) — kept distinct from
   * "nothing was retrieved" so a caller can tell the two apart. */
  UNVERIFIED: "UNVERIFIED",
} as const;

export type LegalEvidenceSourceType =
  (typeof LegalEvidenceSourceType)[keyof typeof LegalEvidenceSourceType];

export type LegalEvidenceVerificationStatus = "VERIFIED" | "UNVERIFIED";

type BaseProvenance<T extends LegalEvidenceSourceType> = {
  sourceType: T;
  /** Human-readable authority name (e.g. "legalinfo.mn", "Улсын дээд шүүх"),
   * not an internal system id. Null when the source class has none. */
  authority: string | null;
  verificationStatus: LegalEvidenceVerificationStatus;
};

export type TrustedCorpusProvenance = BaseProvenance<
  typeof LegalEvidenceSourceType.TORE_VERIFIED | typeof LegalEvidenceSourceType.COURT_DECISION
> & {
  verificationStatus: "VERIFIED";
  retrievedAt: string;
  /** Present only when the source's own official publication carries one. */
  url: string | null;
  documentVersion: string | null;
};

export type OfficialWebProvenance = BaseProvenance<typeof LegalEvidenceSourceType.OFFICIAL_WEB> & {
  verificationStatus: "VERIFIED";
  retrievedAt: string;
  url: string;
  documentVersion: string | null;
};

export type SecondaryWebProvenance = BaseProvenance<typeof LegalEvidenceSourceType.SECONDARY_WEB> & {
  verificationStatus: "UNVERIFIED";
  retrievedAt: string;
  url: string;
};

export type UserDocumentProvenance = BaseProvenance<typeof LegalEvidenceSourceType.USER_DOCUMENT> & {
  verificationStatus: "UNVERIFIED";
  authority: null;
  /** Never a retrieval timestamp — this is upload time, tracked
   * elsewhere (LegalAiConversationDocumentMeta), not duplicated here. */
};

export type ModelKnowledgeProvenance = BaseProvenance<typeof LegalEvidenceSourceType.MODEL_KNOWLEDGE> & {
  verificationStatus: "UNVERIFIED";
  authority: null;
};

export type UnverifiedRetrievalProvenance = BaseProvenance<typeof LegalEvidenceSourceType.UNVERIFIED> & {
  verificationStatus: "UNVERIFIED";
  retrievedAt: string;
  /** Why verification did not pass, for logging only — never shown as if
   * it were a citation. */
  reason: string;
};

/**
 * The closed set of shapes provenance can take. A switch over `sourceType`
 * narrows to the exact fields available — there is no shape that can claim
 * both a `url` and USER_DOCUMENT, or VERIFIED status with MODEL_KNOWLEDGE.
 */
export type LegalEvidenceProvenance =
  | TrustedCorpusProvenance
  | OfficialWebProvenance
  | SecondaryWebProvenance
  | UserDocumentProvenance
  | ModelKnowledgeProvenance
  | UnverifiedRetrievalProvenance;

/**
 * The only sanctioned conversion from the internal, engine-facing
 * {@link LegalCorpusAuthority} shape. Deliberately does not accept or
 * forward `nodeId`, `documentId`, `contentHash`, `sourceContentHash`,
 * `parserId`, or `archiveRecordId` — those are internal locators, and
 * "never expose raw internal locators" is enforced here by this
 * function's own parameter list not having anywhere to put them, not by
 * a runtime redaction step that could be forgotten at a new call site.
 */
export function toLegalEvidenceProvenance(
  authority: Pick<LegalCorpusAuthority, "sourceUrl" | "sourceVersion" | "effectiveFrom">,
  kind: typeof LegalEvidenceSourceType.TORE_VERIFIED | typeof LegalEvidenceSourceType.COURT_DECISION,
  retrievedAt: string,
  authorityName: string | null,
): TrustedCorpusProvenance {
  return {
    sourceType: kind,
    authority: authorityName,
    verificationStatus: "VERIFIED",
    retrievedAt,
    url: authority.sourceUrl ?? null,
    documentVersion: authority.sourceVersion ?? null,
  };
}

/** The single MODEL_KNOWLEDGE instance — a constant, not a constructor,
 * because there is nothing case-specific to parameterize: no retrieval
 * ever backs this source type. */
export const MODEL_KNOWLEDGE_PROVENANCE: ModelKnowledgeProvenance = {
  sourceType: LegalEvidenceSourceType.MODEL_KNOWLEDGE,
  authority: null,
  verificationStatus: "UNVERIFIED",
};

export function userDocumentProvenance(): UserDocumentProvenance {
  return {
    sourceType: LegalEvidenceSourceType.USER_DOCUMENT,
    authority: null,
    verificationStatus: "UNVERIFIED",
  };
}
