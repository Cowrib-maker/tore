/**
 * Domain framework catalogs — issue-kind taxonomies only.
 * No Mongolian (or other) doctrine statements are invented here.
 */

import { LegalDomain, LegalIssueKind, type LegalIssueKind as IssueKind } from "../types";

export const CRIMINAL_ISSUE_KINDS: readonly IssueKind[] = [
  LegalIssueKind.ELEMENTS_OF_OFFENSE,
  LegalIssueKind.UNLAWFULNESS,
  LegalIssueKind.CULPABILITY,
  LegalIssueKind.CAUSATION,
  LegalIssueKind.ATTEMPT_OR_PARTICIPATION,
  LegalIssueKind.EVIDENCE_OR_ADMISSIBILITY,
  LegalIssueKind.PROCEDURAL_LEGALITY,
];

export const CIVIL_ISSUE_KINDS: readonly IssueKind[] = [
  LegalIssueKind.CIVIL_OBLIGATION,
  LegalIssueKind.BREACH,
  LegalIssueKind.DAMAGES,
  LegalIssueKind.CAUSATION,
  LegalIssueKind.EVIDENCE_OR_ADMISSIBILITY,
  LegalIssueKind.PROCEDURAL_LEGALITY,
];

export const ADMINISTRATIVE_ISSUE_KINDS: readonly IssueKind[] = [
  LegalIssueKind.ADMINISTRATIVE_LEGALITY,
  LegalIssueKind.COMPETENCE_OR_JURISDICTION,
  LegalIssueKind.PROCEDURAL_LEGALITY,
  LegalIssueKind.EVIDENCE_OR_ADMISSIBILITY,
];

export function issueKindsForDomain(
  domain: (typeof LegalDomain)[keyof typeof LegalDomain],
): readonly IssueKind[] {
  switch (domain) {
    case LegalDomain.CRIMINAL:
      return CRIMINAL_ISSUE_KINDS;
    case LegalDomain.CIVIL:
      return CIVIL_ISSUE_KINDS;
    case LegalDomain.ADMINISTRATIVE:
      return ADMINISTRATIVE_ISSUE_KINDS;
    default:
      return [];
  }
}
