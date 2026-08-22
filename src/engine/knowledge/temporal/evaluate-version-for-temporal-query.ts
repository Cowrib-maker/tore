import {
  LegalTemporalEvaluationStatus,
  resolveLegalTemporalStatus,
  type LegalTemporalExplicitRelation,
  type LegalTemporalSourceStatus,
  type LegalTemporalStatusResult,
} from "./resolve-legal-temporal-status";
import {
  LegalTemporalQueryKind,
  LegalTemporalQueryPrecision,
  type LegalTemporalQueryIntent,
} from "./parse-legal-temporal-query-intent";

export type LegalTemporalVersionFacts = {
  validFrom: string | null;
  validTo: string | null;
  lawId?: string | null;
  sourceStatus?: LegalTemporalSourceStatus | null;
  explicitRelations?: readonly LegalTemporalExplicitRelation[];
  title?: string | null;
  discoveryIsActive?: boolean;
};

export type LegalTemporalQueryEvaluation = {
  proven: boolean;
  evaluations: LegalTemporalStatusResult[];
};

const APPLICABLE = new Set<string>([
  LegalTemporalEvaluationStatus.IN_FORCE,
  LegalTemporalEvaluationStatus.HISTORICALLY_IN_FORCE,
]);

/**
 * Whether a stored instrument version is proven applicable for a query intent.
 * UNKNOWN is never treated as applicable. Does not invent dates.
 */
export function evaluateVersionForTemporalQuery(
  facts: LegalTemporalVersionFacts,
  intent: LegalTemporalQueryIntent,
  nowIsoDate: string,
): LegalTemporalQueryEvaluation {
  if (intent.kind === LegalTemporalQueryKind.UNSPECIFIED) {
    return { proven: true, evaluations: [] };
  }

  if (
    intent.kind === LegalTemporalQueryKind.HISTORICAL &&
    intent.precision === LegalTemporalQueryPrecision.NONE
  ) {
    return { proven: false, evaluations: [] };
  }

  if (
    intent.kind === LegalTemporalQueryKind.HISTORICAL &&
    intent.precision === LegalTemporalQueryPrecision.YEAR &&
    intent.yearRange
  ) {
    const start = resolveLegalTemporalStatus({
      ...facts,
      asOfDate: intent.yearRange.from,
    });
    const end = resolveLegalTemporalStatus({
      ...facts,
      asOfDate: intent.yearRange.to,
    });
    return {
      proven: APPLICABLE.has(start.status) && APPLICABLE.has(end.status),
      evaluations: [start, end],
    };
  }

  if (
    intent.kind === LegalTemporalQueryKind.HISTORICAL &&
    intent.asOfDate
  ) {
    const evaluation = resolveLegalTemporalStatus({
      ...facts,
      asOfDate: intent.asOfDate,
    });
    return {
      proven: APPLICABLE.has(evaluation.status),
      evaluations: [evaluation],
    };
  }

  if (intent.kind === LegalTemporalQueryKind.CURRENT) {
    const evaluation = resolveLegalTemporalStatus({
      ...facts,
      asOfDate: nowIsoDate,
    });
    return {
      proven: evaluation.status === LegalTemporalEvaluationStatus.IN_FORCE,
      evaluations: [evaluation],
    };
  }

  return { proven: false, evaluations: [] };
}
