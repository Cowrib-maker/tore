/**
 * Second-hop resolution for the dominant real repeal-declaration pattern
 * (14/17 in the local corpus): the repealing act's own entry-into-force
 * clause defers to ANOTHER named law's effective date ("Энэ хуулийг
 * [Target] хууль хүчин төгөлдөр болсон өдрөөс эхлэн дагаж мөрдөнө").
 *
 * This module does no lookup itself — the caller resolves
 * `referencedLawText` against its own corpus (however it indexes titles)
 * and passes the result in. That keeps this a pure, engine-layer
 * function with no database/repository dependency, and keeps title
 * matching in exactly one place (the caller), rather than duplicating it
 * here.
 *
 * Evidence-only: a resolved target with a known effective date makes the
 * repealing act's own effective date deterministically equal to it (the
 * clause says so explicitly) — never a fabricated date, never a guess at
 * which target matches.
 */

import type { EntryIntoForceEvidence } from "./classify-entry-into-force-clause";

export const RepealEffectiveDateStatus = {
  /** The referenced law was found and its own effective date is known — this repeal's effective date equals it, by the clause's own explicit deferral. */
  RESOLVED: "RESOLVED",
  /** The referenced law could not be matched in the corpus at all. */
  TARGET_UNRESOLVED: "TARGET_UNRESOLVED",
  /** The referenced law was matched, but its own effective date is not established either — resolving one more hop would not help. */
  TARGET_DATE_UNKNOWN: "TARGET_DATE_UNKNOWN",
  /** This document's entry-into-force clause is not a cross-document reference at all — this resolver does not apply. */
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type RepealEffectiveDateStatus =
  (typeof RepealEffectiveDateStatus)[keyof typeof RepealEffectiveDateStatus];

export type RepealEffectiveDateResult =
  | { status: "RESOLVED"; effectiveDate: string; referencedLawText: string }
  | { status: "TARGET_UNRESOLVED"; referencedLawText: string }
  | { status: "TARGET_DATE_UNKNOWN"; referencedLawText: string }
  | { status: "NOT_APPLICABLE" };

/** What the caller found when it looked `referencedLawText` up in its own corpus. `found: false` and "found but no date" are kept distinct so the result can say which. */
export type ResolvedReferenceTarget = { found: true; effectiveFrom: string | null } | { found: false };

export function resolveRepealEffectiveDate(
  entryIntoForce: EntryIntoForceEvidence,
  resolvedTarget: ResolvedReferenceTarget,
): RepealEffectiveDateResult {
  if (entryIntoForce.kind !== "CROSS_DOCUMENT_REFERENCE") {
    return { status: "NOT_APPLICABLE" };
  }
  if (!resolvedTarget.found) {
    return { status: "TARGET_UNRESOLVED", referencedLawText: entryIntoForce.referencedLawText };
  }
  if (!resolvedTarget.effectiveFrom) {
    return { status: "TARGET_DATE_UNKNOWN", referencedLawText: entryIntoForce.referencedLawText };
  }
  return {
    status: "RESOLVED",
    effectiveDate: resolvedTarget.effectiveFrom,
    referencedLawText: entryIntoForce.referencedLawText,
  };
}
