/**
 * Deterministic as-of legal status evaluation.
 *
 * Separate from {@link LegalDocumentStatus}: this result is computed from
 * explicit source facts, never from catalog membership or recodification
 * subtitles. Does not fetch, persist, or invent dates.
 */

export const LegalTemporalEvaluationStatus = {
  IN_FORCE: "IN_FORCE",
  REPEALED: "REPEALED",
  EXPIRED: "EXPIRED",
  HISTORICALLY_IN_FORCE: "HISTORICALLY_IN_FORCE",
  UNKNOWN: "UNKNOWN",
} as const;

export type LegalTemporalEvaluationStatus =
  (typeof LegalTemporalEvaluationStatus)[keyof typeof LegalTemporalEvaluationStatus];

export const LegalTemporalStatusBasis = {
  SOURCE_DATES: "SOURCE_DATES",
  EXPLICIT_REPEAL: "EXPLICIT_REPEAL",
  EXPLICIT_EXPIRY: "EXPLICIT_EXPIRY",
  HISTORICAL_DATE_RANGE: "HISTORICAL_DATE_RANGE",
  INSUFFICIENT_SOURCE_DATA: "INSUFFICIENT_SOURCE_DATA",
  /**
   * A matching REPEALS/SUPERSEDES relation was found (same toLawId), but
   * it carries no effectiveDate — never invented here. Distinct from
   * INSUFFICIENT_SOURCE_DATA so a caller can tell "we know of no repeal
   * evidence at all" apart from "we know this was repealed by something,
   * we just cannot date it precisely" (see resolveTemporalValidity in
   * src/application/legal-graph, which is where a current-status query
   * may still treat this as decisive; this module never does).
   */
  EXPLICIT_REPEAL_DATE_UNKNOWN: "EXPLICIT_REPEAL_DATE_UNKNOWN",
} as const;

export type LegalTemporalStatusBasis =
  (typeof LegalTemporalStatusBasis)[keyof typeof LegalTemporalStatusBasis];

export const LegalTemporalRelationType = {
  REPEALS: "REPEALS",
  SUPERSEDES: "SUPERSEDES",
  AMENDS: "AMENDS",
} as const;

export type LegalTemporalRelationType =
  (typeof LegalTemporalRelationType)[keyof typeof LegalTemporalRelationType];

/**
 * Caller-supplied relation. Never inferred from similar titles or
 * recodification subtitles. `toLawId` is the instrument whose force ended.
 */
export type LegalTemporalExplicitRelation = {
  relationType: LegalTemporalRelationType;
  fromLawId: string;
  toLawId: string;
  effectiveDate: string | null;
  sourceLawId: string;
  evidence: string;
};

/** Source-asserted lifecycle, only when the catalog/page actually supplied it. */
export type LegalTemporalSourceStatus = "IN_FORCE" | "EXPIRED" | "REPEALED";

export type LegalTemporalStatusInput = {
  validFrom: string | null;
  validTo: string | null;
  asOfDate: string;
  lawId?: string | null;
  explicitRelations?: readonly LegalTemporalExplicitRelation[];
  sourceStatus?: LegalTemporalSourceStatus | null;
  /**
   * Ignored. Present so tests can prove recodification subtitles and
   * discovery `isactive=1` do not create IN_FORCE or repeal.
   */
  title?: string | null;
  discoveryIsActive?: boolean;
  articleNumbers?: readonly string[];
};

export type LegalTemporalStatusResult = {
  status: LegalTemporalEvaluationStatus;
  validFrom: string | null;
  validTo: string | null;
  basis: LegalTemporalStatusBasis;
};

export function resolveLegalTemporalStatus(
  input: LegalTemporalStatusInput,
): LegalTemporalStatusResult {
  const validFrom = emptyToNull(input.validFrom);
  const validTo = emptyToNull(input.validTo);
  const asOfDate = input.asOfDate;
  const lawId = emptyToNull(input.lawId ?? null);

  const echoed = { validFrom, validTo };

  const ending = explicitEndingRelation(input, lawId, asOfDate);
  if (ending === "COVERS") {
    return {
      status: LegalTemporalEvaluationStatus.REPEALED,
      ...echoed,
      basis: LegalTemporalStatusBasis.EXPLICIT_REPEAL,
    };
  }
  if (ending === "DATE_UNKNOWN") {
    return {
      status: LegalTemporalEvaluationStatus.UNKNOWN,
      ...echoed,
      basis: LegalTemporalStatusBasis.EXPLICIT_REPEAL_DATE_UNKNOWN,
    };
  }

  if (validTo && asOfDate > validTo) {
    if (input.sourceStatus === "EXPIRED") {
      return {
        status: LegalTemporalEvaluationStatus.EXPIRED,
        ...echoed,
        basis: LegalTemporalStatusBasis.EXPLICIT_EXPIRY,
      };
    }
    return {
      status: LegalTemporalEvaluationStatus.UNKNOWN,
      ...echoed,
      basis: LegalTemporalStatusBasis.SOURCE_DATES,
    };
  }

  if (validFrom && asOfDate < validFrom) {
    return {
      status: LegalTemporalEvaluationStatus.UNKNOWN,
      ...echoed,
      basis: LegalTemporalStatusBasis.SOURCE_DATES,
    };
  }

  const started = Boolean(validFrom && validFrom <= asOfDate);
  const notEnded = validTo == null || asOfDate <= validTo;

  if (input.sourceStatus === "IN_FORCE" && started && notEnded) {
    return {
      status: LegalTemporalEvaluationStatus.IN_FORCE,
      ...echoed,
      basis: LegalTemporalStatusBasis.SOURCE_DATES,
    };
  }

  if (validFrom && validTo && validFrom <= asOfDate && asOfDate <= validTo) {
    return {
      status: LegalTemporalEvaluationStatus.HISTORICALLY_IN_FORCE,
      ...echoed,
      basis: LegalTemporalStatusBasis.HISTORICAL_DATE_RANGE,
    };
  }

  if (!validFrom && !validTo) {
    return {
      status: LegalTemporalEvaluationStatus.UNKNOWN,
      ...echoed,
      basis: LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA,
    };
  }

  return {
    status: LegalTemporalEvaluationStatus.UNKNOWN,
    ...echoed,
    basis: LegalTemporalStatusBasis.SOURCE_DATES,
  };
}

/**
 * "COVERS": a matching relation's effectiveDate has passed as of asOfDate
 * — force ends, REPEALED (unchanged original behavior).
 * "DATE_UNKNOWN": a matching relation exists but supplies no effectiveDate
 * at all — never invented, so date-based coverage genuinely cannot be
 * determined (distinct from a relation whose effectiveDate simply hasn't
 * arrived yet, which is "NONE" below, same as no relation existing).
 * "NONE": no relation matches, or every match's dated effectiveDate has
 * not yet arrived — falls through to validFrom/validTo evaluation exactly
 * as before this basis was added.
 */
function explicitEndingRelation(
  input: LegalTemporalStatusInput,
  lawId: string | null,
  asOfDate: string,
): "COVERS" | "DATE_UNKNOWN" | "NONE" {
  if (!lawId) {
    return "NONE";
  }
  let sawDatelessMatch = false;
  for (const relation of input.explicitRelations ?? []) {
    if (
      relation.relationType !== LegalTemporalRelationType.REPEALS &&
      relation.relationType !== LegalTemporalRelationType.SUPERSEDES
    ) {
      continue;
    }
    if (relation.toLawId !== lawId) {
      continue;
    }
    const effectiveDate = emptyToNull(relation.effectiveDate);
    if (!effectiveDate) {
      sawDatelessMatch = true;
      continue;
    }
    if (asOfDate < effectiveDate) {
      continue;
    }
    return "COVERS";
  }
  return sawDatelessMatch ? "DATE_UNKNOWN" : "NONE";
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
