/**
 * Foundation contracts for Legal Doctrine and Legal Reasoning.
 *
 * Layering (do not collapse):
 *   Legal Data → Legal Knowledge → Legal Doctrine → Legal Reasoning
 *
 * Doctrine is distinct from positive law, court decisions,
 * administrative regulations, and AI inference.
 *
 * No LLM calls, scrapers, or doctrine corpus population live here.
 */

/** What kind of authority a claim rests on. */
export const LegalAuthorityKind = {
  POSITIVE_LAW: "POSITIVE_LAW",
  COURT_DECISION: "COURT_DECISION",
  ADMINISTRATIVE_REGULATION: "ADMINISTRATIVE_REGULATION",
  DOCTRINE: "DOCTRINE",
  /** Never sufficient alone for a legal conclusion. */
  AI_INFERENCE: "AI_INFERENCE",
} as const;

export type LegalAuthorityKind =
  (typeof LegalAuthorityKind)[keyof typeof LegalAuthorityKind];

/**
 * Primary legal domains for classification contracts.
 * Jurisdiction-agnostic labels — not Mongolian doctrine content.
 */
export const LegalDomain = {
  CRIMINAL: "CRIMINAL",
  CIVIL: "CIVIL",
  ADMINISTRATIVE: "ADMINISTRATIVE",
  CONSTITUTIONAL: "CONSTITUTIONAL",
  PROCEDURAL: "PROCEDURAL",
  UNKNOWN: "UNKNOWN",
} as const;

export type LegalDomain = (typeof LegalDomain)[keyof typeof LegalDomain];

/** How completely a claim is backed by non-AI sources. */
export const ReasoningSupportStatus = {
  SOURCE_BACKED: "SOURCE_BACKED",
  PARTIAL: "PARTIAL",
  UNSUPPORTED: "UNSUPPORTED",
  INCOMPLETE: "INCOMPLETE",
  CONFLICTED: "CONFLICTED",
} as const;

export type ReasoningSupportStatus =
  (typeof ReasoningSupportStatus)[keyof typeof ReasoningSupportStatus];

/** Claim kinds that must carry source-backed support when asserted. */
export const SourceBackedClaimKind = {
  LEGAL_RULE: "legal_rule",
  DOCTRINE: "doctrine",
  INTERPRETATION: "interpretation",
  CONCLUSION: "conclusion",
} as const;

export type SourceBackedClaimKind =
  (typeof SourceBackedClaimKind)[keyof typeof SourceBackedClaimKind];

/** Ordered stages of a legal reasoning trace. */
export const LegalReasoningStepKind = {
  ISSUE: "ISSUE",
  APPLICABLE_DOCTRINE: "APPLICABLE_DOCTRINE",
  LEGAL_RULE: "LEGAL_RULE",
  ELEMENTS: "ELEMENTS",
  FACTS: "FACTS",
  EVIDENCE: "EVIDENCE",
  SUBSUMPTION: "SUBSUMPTION",
  CONCLUSION: "CONCLUSION",
} as const;

export type LegalReasoningStepKind =
  (typeof LegalReasoningStepKind)[keyof typeof LegalReasoningStepKind];

export const LegalReasoningStepStatus = {
  COMPLETE: "COMPLETE",
  INCOMPLETE: "INCOMPLETE",
  UNSUPPORTED: "UNSUPPORTED",
  CONFLICTED: "CONFLICTED",
  SKIPPED: "SKIPPED",
} as const;

export type LegalReasoningStepStatus =
  (typeof LegalReasoningStepStatus)[keyof typeof LegalReasoningStepStatus];

export const LegalConflictKind = {
  SOURCE_CONFLICT: "SOURCE_CONFLICT",
  DOCTRINE_CONFLICT: "DOCTRINE_CONFLICT",
  UNRESOLVED_ISSUE: "UNRESOLVED_ISSUE",
} as const;

export type LegalConflictKind =
  (typeof LegalConflictKind)[keyof typeof LegalConflictKind];

export const SubsumptionMatchStatus = {
  SATISFIED: "SATISFIED",
  NOT_SATISFIED: "NOT_SATISFIED",
  INDETERMINATE: "INDETERMINATE",
  MISSING_FACT: "MISSING_FACT",
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
} as const;

export type SubsumptionMatchStatus =
  (typeof SubsumptionMatchStatus)[keyof typeof SubsumptionMatchStatus];

/**
 * Temporal applicability for doctrine, tests, rules, and evaluations.
 * Dates are ISO-8601 (`YYYY-MM-DD` or instant).
 */
export type TemporalApplicability = {
  validFrom: string | null;
  validTo: string | null;
  sourceVersion: string | null;
  /** Instant or date at which applicability is evaluated. */
  applicableAt: string | null;
};

/** Empty temporal shell for fixtures that have no dates yet. */
export function emptyTemporal(
  overrides: Partial<TemporalApplicability> = {},
): TemporalApplicability {
  return {
    validFrom: null,
    validTo: null,
    sourceVersion: null,
    applicableAt: null,
    ...overrides,
  };
}
