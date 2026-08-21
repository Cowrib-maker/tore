/**
 * Temporal applicability helpers for doctrine / rules / tests.
 * Never silently substitute today's law for a historical applicableAt.
 */

import type { TemporalApplicability } from "./types";

/**
 * True when `applicableAt` falls within [validFrom, validTo] (inclusive bounds
 * when present). Null bounds are treated as open-ended.
 */
export function isApplicableAt(
  temporal: TemporalApplicability,
  applicableAt: string,
): boolean {
  if (temporal.validFrom && applicableAt < temporal.validFrom) {
    return false;
  }
  if (temporal.validTo && applicableAt > temporal.validTo) {
    return false;
  }
  return true;
}

export function filterApplicableAt<T extends { temporal: TemporalApplicability }>(
  items: readonly T[],
  applicableAt: string,
): T[] {
  return items.filter((item) => isApplicableAt(item.temporal, applicableAt));
}
