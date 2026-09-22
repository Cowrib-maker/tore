/**
 * Legal Temporal Validity (Phase 3 of the temporal/authority intelligence
 * foundation). Answers "was this source valid at date X" / "what is its
 * current temporal status" by composing two independently-trustworthy
 * evidence sources — never inferring either from the other:
 *
 *  - Date evidence: source.validFrom/validTo (+ any caller-supplied,
 *    already-dated LegalTemporalExplicitRelation[]) via the existing,
 *    unmodified-in-spirit resolveLegalTemporalStatus.
 *  - Graph evidence: an explicit REPEALS/SUPERSEDES chain from
 *    resolveRepealChain, which needs no date at all to prove the FACT
 *    that a repeal was declared.
 *
 * These are evaluated at the graph-node-id level (repeal chain) and the
 * lawId level (date engine) separately and combined here, rather than
 * forcing repeal-chain hops (keyed by graph node id) into the date
 * engine's lawId-keyed explicitRelations shape — the two id schemes are
 * not interchangeable without another lookup this module has no need to
 * perform.
 */

import type { AsyncGraphRepository } from "@/engine/graph";
import { resolveRepealChain, type RepealChainResult } from "@/engine/graph";
import {
  LegalTemporalEvaluationStatus,
  LegalTemporalStatusBasis,
  resolveLegalTemporalStatus,
  type LegalTemporalExplicitRelation,
  type LegalTemporalSourceStatus,
  type LegalTemporalStatusBasis as LegalTemporalStatusBasisValue,
} from "@/engine/knowledge/temporal/resolve-legal-temporal-status";

export type TemporalValiditySource = {
  /** Graph node id (documentGraphId(...)) — the repeal chain is resolved from here. */
  nodeId: string;
  /** LegalInfo lawId, when known — used only to match caller-supplied dated explicitRelations, exactly as resolveLegalTemporalStatus already does. */
  lawId?: string | null;
  validFrom: string | null;
  validTo: string | null;
  sourceStatus?: LegalTemporalSourceStatus | null;
  title?: string | null;
  /** Already-dated relations from another source, if the caller has any — never invented here, merely passed through. */
  explicitRelations?: readonly LegalTemporalExplicitRelation[];
};

export type ResolveTemporalValidityOptions = {
  /** ISO date. Omitted means "current status" — see the current-vs-historical distinction below. */
  asOfDate?: string;
  /** Injectable clock for deterministic tests; defaults to the real current time. */
  now?: () => Date;
  maxRepealChainDepth?: number;
};

export type TemporalValidityResult = {
  status: LegalTemporalEvaluationStatus;
  effectiveFrom: string | null;
  /** Null whenever the precise cutoff date is not established — never invented, even when status is REPEALED. */
  effectiveUntil: string | null;
  basis: LegalTemporalStatusBasisValue;
  evidence: string[];
  /** Human-readable caveat when the status rests on something less than a full date-evidence chain. Null when there is nothing to caveat. */
  uncertainty: string | null;
  /** Graph provenance for a REPEALED/UNKNOWN-from-repeal-evidence conclusion. Null when no repeal chain evidence contributed to the result. */
  repealChain: RepealChainResult | null;
};

const DATE_DECISIVE_STATUSES = new Set<LegalTemporalEvaluationStatus>([
  LegalTemporalEvaluationStatus.IN_FORCE,
  LegalTemporalEvaluationStatus.REPEALED,
  LegalTemporalEvaluationStatus.EXPIRED,
  LegalTemporalEvaluationStatus.HISTORICALLY_IN_FORCE,
]);

const DATELESS_REPEAL_CURRENT_UNCERTAINTY =
  "Repeal is evidenced by an explicit source declaration; the repeal act's own effective date is not established in local records, so the exact cutoff date is unknown.";
const DATELESS_REPEAL_HISTORICAL_UNCERTAINTY =
  "An explicit repeal relation exists for this source, but its effective date is not established, so applicability at this specific historical date cannot be determined.";

/**
 * `asOfDate` omitted = current-status query. Only then does an explicit,
 * dateless repeal-chain finding resolve to REPEALED (the repealing act is
 * already a real, already-published document — its non-existence is not
 * in question, only its exact cutoff date). For a historical asOfDate,
 * the same dateless evidence is NOT enough to say the repeal had already
 * taken effect by that date, so the result stays UNKNOWN — never invents
 * a date to bridge the gap either way.
 */
export async function resolveTemporalValidity(
  repository: AsyncGraphRepository,
  source: TemporalValiditySource,
  options?: ResolveTemporalValidityOptions,
): Promise<TemporalValidityResult> {
  const isCurrentQuery = options?.asOfDate == null;
  const asOfDate = options?.asOfDate ?? isoDateFromClock(options?.now?.() ?? new Date());

  const [repealChain, dateBased] = await Promise.all([
    resolveRepealChain(repository, source.nodeId, { maxDepth: options?.maxRepealChainDepth }),
    Promise.resolve(
      resolveLegalTemporalStatus({
        validFrom: source.validFrom,
        validTo: source.validTo,
        asOfDate,
        lawId: source.lawId ?? null,
        sourceStatus: source.sourceStatus ?? null,
        title: source.title ?? null,
        explicitRelations: source.explicitRelations ?? [],
      }),
    ),
  ]);

  const hasRepealChainEvidence = repealChain.chain.length > 0;
  const repealChainEvidence = repealChain.chain.flatMap((hop) => hop.evidence);

  if (DATE_DECISIVE_STATUSES.has(dateBased.status)) {
    return {
      status: dateBased.status,
      effectiveFrom: dateBased.validFrom,
      effectiveUntil: dateBased.validTo,
      basis: dateBased.basis,
      evidence: repealChainEvidence,
      uncertainty: null,
      repealChain: hasRepealChainEvidence ? repealChain : null,
    };
  }

  if (hasRepealChainEvidence) {
    if (isCurrentQuery) {
      return {
        status: LegalTemporalEvaluationStatus.REPEALED,
        effectiveFrom: dateBased.validFrom,
        effectiveUntil: null,
        basis: LegalTemporalStatusBasis.EXPLICIT_REPEAL_DATE_UNKNOWN,
        evidence: repealChainEvidence,
        uncertainty: DATELESS_REPEAL_CURRENT_UNCERTAINTY,
        repealChain,
      };
    }
    return {
      status: LegalTemporalEvaluationStatus.UNKNOWN,
      effectiveFrom: dateBased.validFrom,
      effectiveUntil: dateBased.validTo,
      basis: LegalTemporalStatusBasis.EXPLICIT_REPEAL_DATE_UNKNOWN,
      evidence: repealChainEvidence,
      uncertainty: DATELESS_REPEAL_HISTORICAL_UNCERTAINTY,
      repealChain,
    };
  }

  return {
    status: dateBased.status,
    effectiveFrom: dateBased.validFrom,
    effectiveUntil: dateBased.validTo,
    basis: dateBased.basis,
    evidence: [],
    uncertainty:
      dateBased.basis === LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA
        ? "No effective/valid-to dates and no repeal evidence were found for this source."
        : null,
    repealChain: null,
  };
}

function isoDateFromClock(now: Date): string {
  return now.toISOString().slice(0, 10);
}
