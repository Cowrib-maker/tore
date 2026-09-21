import { GraphNodeType } from "./types";

/**
 * TORE Authority Precedence Policy.
 *
 * Single authoritative place to answer "does authority A outrank
 * authority B". Conflict detection, court-practice retrieval, retrieval
 * ranking, reasoning, agentic search, and citation confidence should all
 * call this instead of comparing GraphNodeType values inline.
 *
 * IMPORTANT — this module's default tier ordering is NOT a verified
 * Mongolian legal-hierarchy determination. A repository-wide search for
 * existing Mongolian legal-hierarchy terminology or precedence content
 * (2026-09-21) found none. The tiers below encode only general,
 * widely-applicable civil-law instrument-type conventions (statute above
 * subordinate regulation; a supreme court's own interpretive resolutions
 * carry more weight than an ordinary first-instance decision) and are
 * exposed as swappable configuration for exactly this reason — every
 * result this module returns carries a `confidence` field so a caller
 * can tell a verified determination from this default apart. Do not
 * upgrade DEFAULT_TIERS to "confidence: HIGH" without legal SME review
 * backed by actual repository evidence (e.g. a cited provision of
 * Mongolia's Law on Legislation).
 */

/** Provision-level nodes (ARTICLE/PARAGRAPH/SUBPARAGRAPH/PROVISION) have no
 * precedence of their own — they inherit the precedence of the document
 * that CONTAINS them. Excluding them from the input type (rather than
 * silently defaulting) forces a caller to resolve to the containing
 * document's type first, which is the only way to know a real tier. */
export type DocumentLevelGraphNodeType = Exclude<
  GraphNodeType,
  | typeof GraphNodeType.ARTICLE
  | typeof GraphNodeType.PARAGRAPH
  | typeof GraphNodeType.SUBPARAGRAPH
  | typeof GraphNodeType.PROVISION
>;

/**
 * Higher number = higher precedence. Gaps are deliberate so a future,
 * evidence-backed tier (e.g. CONSTITUTION, INTERNATIONAL_TREATY) can be
 * inserted without renumbering everything else.
 */
export const DEFAULT_AUTHORITY_PRECEDENCE_TIERS: Record<
  DocumentLevelGraphNodeType,
  number
> = {
  [GraphNodeType.LAW]: 80,
  [GraphNodeType.SUPREME_COURT_RESOLUTION]: 70,
  [GraphNodeType.GOVERNMENT_REGULATION]: 60,
  [GraphNodeType.COURT_DECISION]: 40,
  [GraphNodeType.PROSECUTOR_GUIDELINE]: 30,
  [GraphNodeType.LEGAL_COMMENTARY]: 10,
  [GraphNodeType.AUTHORITY]: 0,
};

export const AuthorityPrecedenceOutcome = {
  FIRST_HIGHER: "FIRST_HIGHER",
  SECOND_HIGHER: "SECOND_HIGHER",
  EQUAL: "EQUAL",
  INDETERMINATE: "INDETERMINATE",
} as const;
export type AuthorityPrecedenceOutcome =
  (typeof AuthorityPrecedenceOutcome)[keyof typeof AuthorityPrecedenceOutcome];

export const AuthorityPrecedenceBasis = {
  /** One side is no longer in force; force always beats nominal tier. */
  TEMPORAL_STATUS: "TEMPORAL_STATUS",
  NOMINAL_TIER: "NOMINAL_TIER",
  /** Same tier, resolved by effective-date recency (lex posterior). */
  TIE_BREAK_RECENCY: "TIE_BREAK_RECENCY",
  /** Same tier, no date to break the tie, or an unrecognized type. */
  UNKNOWN: "UNKNOWN",
} as const;
export type AuthorityPrecedenceBasis =
  (typeof AuthorityPrecedenceBasis)[keyof typeof AuthorityPrecedenceBasis];

export const AuthorityPrecedenceConfidence = {
  /** Backed by an unambiguous fact (one side is repealed/expired). */
  HIGH: "HIGH",
  /** Backed only by DEFAULT_AUTHORITY_PRECEDENCE_TIERS — see module doc. */
  DEFAULT_UNVERIFIED: "DEFAULT_UNVERIFIED",
} as const;
export type AuthorityPrecedenceConfidence =
  (typeof AuthorityPrecedenceConfidence)[keyof typeof AuthorityPrecedenceConfidence];

/**
 * Force/validity as of the comparison date. Optional: when omitted, force
 * is assumed unknown and precedence falls back to nominal tier only.
 * Deliberately a plain union (not an import from engine/knowledge/temporal)
 * so this module has no dependency on how a caller determined force.
 */
export type AuthorityForceStatus = "IN_FORCE" | "NOT_IN_FORCE" | "UNKNOWN";

export type AuthorityPrecedenceCandidate = {
  type: DocumentLevelGraphNodeType;
  force?: AuthorityForceStatus;
  /** ISO date. Used only as a same-tier tie-break. */
  effectiveFrom?: string | null;
};

export type AuthorityPrecedenceResult = {
  outcome: AuthorityPrecedenceOutcome;
  basis: AuthorityPrecedenceBasis;
  confidence: AuthorityPrecedenceConfidence;
  explanation: string;
};

export type AuthorityPrecedencePolicy = {
  tiers: Record<DocumentLevelGraphNodeType, number>;
};

export function defaultAuthorityPrecedencePolicy(): AuthorityPrecedencePolicy {
  return { tiers: DEFAULT_AUTHORITY_PRECEDENCE_TIERS };
}

/**
 * Compares two authorities. Temporal force always dominates nominal tier:
 * a repealed LAW never outranks an in-force GOVERNMENT_REGULATION here,
 * because a repealed instrument has no legal force to rank in the first
 * place. Only when force is equal (or unknown on both sides) does the
 * nominal tier decide, and only DEFAULT_AUTHORITY_PRECEDENCE_TIERS
 * confidence is ever DEFAULT_UNVERIFIED — a temporal-status determination
 * is HIGH because it rests on a fact, not a policy guess.
 */
export function compareAuthorityPrecedence(
  first: AuthorityPrecedenceCandidate,
  second: AuthorityPrecedenceCandidate,
  policy: AuthorityPrecedencePolicy = defaultAuthorityPrecedencePolicy(),
): AuthorityPrecedenceResult {
  const firstForce = first.force ?? "UNKNOWN";
  const secondForce = second.force ?? "UNKNOWN";

  if (firstForce !== secondForce && (firstForce === "NOT_IN_FORCE" || secondForce === "NOT_IN_FORCE")) {
    if (firstForce === "NOT_IN_FORCE" && secondForce !== "NOT_IN_FORCE") {
      return {
        outcome: AuthorityPrecedenceOutcome.SECOND_HIGHER,
        basis: AuthorityPrecedenceBasis.TEMPORAL_STATUS,
        confidence: AuthorityPrecedenceConfidence.HIGH,
        explanation:
          "First authority is not in force; a repealed/expired instrument cannot outrank one that is.",
      };
    }
    if (secondForce === "NOT_IN_FORCE" && firstForce !== "NOT_IN_FORCE") {
      return {
        outcome: AuthorityPrecedenceOutcome.FIRST_HIGHER,
        basis: AuthorityPrecedenceBasis.TEMPORAL_STATUS,
        confidence: AuthorityPrecedenceConfidence.HIGH,
        explanation:
          "Second authority is not in force; a repealed/expired instrument cannot outrank one that is.",
      };
    }
  }

  const firstTier = policy.tiers[first.type];
  const secondTier = policy.tiers[second.type];

  if (firstTier === undefined || secondTier === undefined) {
    return {
      outcome: AuthorityPrecedenceOutcome.INDETERMINATE,
      basis: AuthorityPrecedenceBasis.UNKNOWN,
      confidence: AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED,
      explanation: "One or both authority types have no configured precedence tier.",
    };
  }

  if (firstTier > secondTier) {
    return {
      outcome: AuthorityPrecedenceOutcome.FIRST_HIGHER,
      basis: AuthorityPrecedenceBasis.NOMINAL_TIER,
      confidence: AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED,
      explanation: `${first.type} outranks ${second.type} under the default precedence policy.`,
    };
  }
  if (secondTier > firstTier) {
    return {
      outcome: AuthorityPrecedenceOutcome.SECOND_HIGHER,
      basis: AuthorityPrecedenceBasis.NOMINAL_TIER,
      confidence: AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED,
      explanation: `${second.type} outranks ${first.type} under the default precedence policy.`,
    };
  }

  const firstDate = emptyToNull(first.effectiveFrom);
  const secondDate = emptyToNull(second.effectiveFrom);
  if (firstDate && secondDate && firstDate !== secondDate) {
    return firstDate > secondDate
      ? {
          outcome: AuthorityPrecedenceOutcome.FIRST_HIGHER,
          basis: AuthorityPrecedenceBasis.TIE_BREAK_RECENCY,
          confidence: AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED,
          explanation:
            "Both authorities share the same precedence tier; the later-effective instrument is preferred (lex posterior), an unverified default tie-break rule.",
        }
      : {
          outcome: AuthorityPrecedenceOutcome.SECOND_HIGHER,
          basis: AuthorityPrecedenceBasis.TIE_BREAK_RECENCY,
          confidence: AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED,
          explanation:
            "Both authorities share the same precedence tier; the later-effective instrument is preferred (lex posterior), an unverified default tie-break rule.",
        };
  }

  return {
    outcome: AuthorityPrecedenceOutcome.EQUAL,
    basis: AuthorityPrecedenceBasis.NOMINAL_TIER,
    confidence: AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED,
    explanation:
      "Both authorities share the same precedence tier and no effective date breaks the tie.",
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
