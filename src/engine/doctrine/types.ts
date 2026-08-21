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
  /** Explicit uncertain outcome for element-by-element case analysis. */
  UNCERTAIN: "UNCERTAIN",
  /** No adequate mapping — element was not evaluated. */
  NOT_EVALUATED: "NOT_EVALUATED",
  MISSING_FACT: "MISSING_FACT",
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
} as const;

export type SubsumptionMatchStatus =
  (typeof SubsumptionMatchStatus)[keyof typeof SubsumptionMatchStatus];

/**
 * Final disposition of a case-analysis conclusion.
 * SUPPORTED only when rule, provenance, elements, facts, and trace are present.
 */
export const ConclusionDisposition = {
  SUPPORTED: "SUPPORTED",
  UNSUPPORTED: "UNSUPPORTED",
  INSUFFICIENT_FACTS: "INSUFFICIENT_FACTS",
  CONFLICTING_AUTHORITY: "CONFLICTING_AUTHORITY",
} as const;

export type ConclusionDisposition =
  (typeof ConclusionDisposition)[keyof typeof ConclusionDisposition];

/**
 * Candidate issue kinds for spotting — taxonomy labels only.
 * Not Mongolian doctrine content; not assertions that an issue applies.
 */
export const LegalIssueKind = {
  ELEMENTS_OF_OFFENSE: "elements_of_offense",
  UNLAWFULNESS: "unlawfulness",
  CULPABILITY: "culpability",
  CAUSATION: "causation",
  ATTEMPT_OR_PARTICIPATION: "attempt_or_participation",
  CIVIL_OBLIGATION: "civil_obligation",
  BREACH: "breach",
  DAMAGES: "damages",
  ADMINISTRATIVE_LEGALITY: "administrative_legality",
  COMPETENCE_OR_JURISDICTION: "competence_or_jurisdiction",
  PROCEDURAL_LEGALITY: "procedural_legality",
  EVIDENCE_OR_ADMISSIBILITY: "evidence_or_admissibility",
} as const;

export type LegalIssueKind =
  (typeof LegalIssueKind)[keyof typeof LegalIssueKind];

/** Ordered stages of a full case-analysis workflow (UI-serializable). */
export const CaseAnalysisStage = {
  FACTS: "FACTS",
  LEGAL_ISSUES: "LEGAL_ISSUES",
  APPLICABLE_DOMAIN: "APPLICABLE_DOMAIN",
  APPLICABLE_DOCTRINE: "APPLICABLE_DOCTRINE",
  LEGAL_RULES: "LEGAL_RULES",
  ELEMENTS_TEST: "ELEMENTS_TEST",
  EVIDENCE: "EVIDENCE",
  FACT_MAPPING: "FACT_MAPPING",
  SUBSUMPTION: "SUBSUMPTION",
  COUNTERARGUMENTS: "COUNTERARGUMENTS",
  CONCLUSION: "CONCLUSION",
} as const;

export type CaseAnalysisStage =
  (typeof CaseAnalysisStage)[keyof typeof CaseAnalysisStage];

/**
 * How elements were taken from the article. Structural only — not doctrine.
 */
export const ElementExtractionKind = {
  ENUMERATED: "ENUMERATED",
  CONJUNCTIVE_LIST: "CONJUNCTIVE_LIST",
  WHOLE_ARTICLE: "WHOLE_ARTICLE",
  NONE: "NONE",
} as const;

export type ElementExtractionKind =
  (typeof ElementExtractionKind)[keyof typeof ElementExtractionKind];

/** How a fact relates to a legal-test element. */
export const FactElementRelation = {
  SUPPORTS: "SUPPORTS",
  NEGATES: "NEGATES",
  UNCERTAIN: "UNCERTAIN",
  IRRELEVANT: "IRRELEVANT",
} as const;

export type FactElementRelation =
  (typeof FactElementRelation)[keyof typeof FactElementRelation];

export const MappingConfidence = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type MappingConfidence =
  (typeof MappingConfidence)[keyof typeof MappingConfidence];

export const MappingMethod = {
  EXPLICIT: "EXPLICIT",
  LEXICAL: "LEXICAL",
  MANUAL: "MANUAL",
} as const;

export type MappingMethod =
  (typeof MappingMethod)[keyof typeof MappingMethod];

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
