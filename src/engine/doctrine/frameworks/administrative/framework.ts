/**
 * Source-backed IAdministrativeDoctrineFramework, replacing
 * EmptyAdministrativeDoctrineFramework's placeholder for the methodology
 * handbook's administrative-law framework.
 *
 * `selectApplicableDoctrine` returns the FULL canonical formal/substantive
 * tests (the complete catalog) — it has no way to know, from
 * FrameworkContext alone, which §54.1.2-54.1.8 or formal-item-4 elements a
 * specific case's fact pattern actually reaches (see admissibility-test.ts's
 * own note). Case-specific curation is the caller's responsibility, via
 * CaseAnalysisRequest.legalTest (already supported by the unmodified
 * orchestrator) or by pre-filtering the exported element catalogs directly.
 */
import type {
  FrameworkContext,
  FrameworkIssueSelection,
  FrameworkTestSelection,
  IAdministrativeDoctrineFramework,
} from "../types";
import type { LegalConclusion, LegalIssue } from "../../models";
import { createFormalLegalityTest } from "./formal-legality-test";
import { createSubstantiveLegalityTest } from "./substantive-legality-test";

export class SourceBackedAdministrativeDoctrineFramework
  implements IAdministrativeDoctrineFramework
{
  readonly domain = "ADMINISTRATIVE" as const;

  identifyIssues(_context: FrameworkContext): FrameworkIssueSelection {
    return {
      issues: [],
      notes: [
        "Dispute-subject classification (захиргааны акт/гэрээ/хэм хэмжээний акт/эрх зvйн харилцаа/бусад) is not auto-inferred from facts — no source-backed heuristic exists for 4 of the 5 categories. Use AdministrativeDisputeSubject + the act-classification test (ЗЕХ §37.1) explicitly.",
      ],
    };
  }

  selectApplicableDoctrine(
    _issue: LegalIssue,
    _context: FrameworkContext,
  ): FrameworkTestSelection {
    return {
      tests: [createFormalLegalityTest(), createSubstantiveLegalityTest()],
      doctrines: [],
      rules: [],
      notes: [
        "Canonical formal (4 items) and substantive (3 items) legality tests from the methodology handbook, full catalog. Case-specific applicability (which elements this case's facts actually reach) is not filtered here — pass a curated LegalTest via CaseAnalysisRequest.legalTest for a specific case.",
      ],
    };
  }

  proposeConclusionStructure(
    _issue: LegalIssue,
    _selection: FrameworkTestSelection,
  ): Pick<LegalConclusion, "issueId" | "statement" | "llmGeneratedAlone"> | null {
    // The §45/§47/§106.3.x defect → consequence mapping is a separate,
    // richer domain-specific enrichment (see legal-consequence.ts),
    // applied by the caller alongside the orchestrator's own generic
    // conclusion — not asserted here.
    return null;
  }
}
