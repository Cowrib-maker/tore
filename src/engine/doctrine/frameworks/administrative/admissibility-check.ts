/**
 * Canonical entry point for ADMINISTRATIVE case analysis.
 *
 * "Тогтоох хэсэг" (admissibility) must run — and can reject the case —
 * BEFORE "Vндэслэлт хэсэг" (merits) ever starts (p.6-7: the gate is
 * checked first; only a case that clears it proceeds to the
 * formal/substantive tests). `analyzeAdministrativeCase` is THE ONLY
 * exported function callers use; it runs the gate and, only if it
 * passes, delegates to the existing, unmodified `CaseAnalysisOrchestrator`.
 *
 * `checkAdministrativeAdmissibility` below is deliberately NOT exported
 * (not from this file, not from this module's index.ts, not from the
 * top-level @/engine/doctrine barrel). It exists only so
 * `analyzeAdministrativeCase` has something to call — a caller cannot
 * invoke it directly, run the gate, and then call
 * `CaseAnalysisOrchestrator.analyze()` itself, which would recreate the
 * "two separate calls" pattern this module exists to avoid and would let
 * the gate be silently skipped by a caller that forgets to check its
 * result. Tests reach it only through `analyzeAdministrativeCase`'s
 * returned `.admissibility` field, never by importing the function.
 */
import type { LegalEvidence, LegalFact, LegalTest } from "../../models";
import {
  DefaultSubsumptionEngine,
  DeterministicFactElementMapper,
  type CaseAnalysisOrchestrator,
  type CaseAnalysisRequest,
  type CaseAnalysisResult,
  type ExplicitFactMappingInput,
  type SubsumptionEngineResult,
} from "../../case-analysis";
import {
  ADMISSIBILITY_CONDITIONAL_ELEMENTS,
  ADMISSIBILITY_MANDATORY_ELEMENTS,
  createAdmissibilityTest,
} from "./admissibility-test";

export type AdministrativeAdmissibilityRequest = {
  facts: readonly LegalFact[];
  evidence: readonly LegalEvidence[];
  applicableAt: string;
  /**
   * §54.1.2-54.1.8 conditional element ids this case's fact pattern
   * actually reaches (p.7, p.11-12: "тохиолдлын өгөгдлөөс хамаарч зарим
   * нөхцөлийг шалгахгvй байж болно"). Omit to check only the four
   * always-mandatory §54.1.1 sub-questions.
   */
  conditionalElementIds?: readonly string[];
  mappings?: readonly ExplicitFactMappingInput[];
};

export type AdministrativeAdmissibilityResult = {
  admissible: boolean;
  test: LegalTest;
  subsumption: SubsumptionEngineResult;
  rejectionReason: string | null;
};

/** Module-private — see the file header. Not exported. */
function checkAdministrativeAdmissibility(
  request: AdministrativeAdmissibilityRequest,
): AdministrativeAdmissibilityResult {
  const conditional = ADMISSIBILITY_CONDITIONAL_ELEMENTS.filter((element) =>
    (request.conditionalElementIds ?? []).includes(element.id),
  );
  const test = createAdmissibilityTest([
    ...ADMISSIBILITY_MANDATORY_ELEMENTS,
    ...conditional,
  ]);

  const mapper = new DeterministicFactElementMapper();
  const mappingResult = mapper.map({
    facts: request.facts,
    elements: test.elements,
    evidence: request.evidence,
    applicableAt: request.applicableAt,
    explicitMappings: request.mappings,
  });

  const engine = new DefaultSubsumptionEngine();
  const subsumption = engine.apply({
    legalTest: test,
    facts: request.facts,
    evidence: request.evidence,
    mappings: mappingResult.mappings,
  });

  const admissible = subsumption.allRequiredSatisfied;
  const failing = subsumption.applications.find(
    (application) => application.result !== "SATISFIED",
  );

  return {
    admissible,
    test,
    subsumption,
    rejectionReason: admissible
      ? null
      : failing
        ? `${failing.element.label}: ${failing.explanation}`
        : "Admissibility could not be established.",
  };
}

export type AdministrativeCaseAnalysisRequest = {
  facts: readonly LegalFact[];
  evidence: readonly LegalEvidence[];
  applicableAt: string;
  conditionalAdmissibilityElementIds?: readonly string[];
  admissibilityMappings?: readonly ExplicitFactMappingInput[];
  /** Full merits request, forwarded as-is to CaseAnalysisOrchestrator.analyze(). */
  merits: CaseAnalysisRequest;
};

export type AdministrativeCaseAnalysisResult =
  | {
      admissible: false;
      admissibility: AdministrativeAdmissibilityResult;
      merits: null;
    }
  | {
      admissible: true;
      admissibility: AdministrativeAdmissibilityResult;
      merits: CaseAnalysisResult;
    };

/**
 * THE canonical entry point for administrative-domain case analysis.
 * One call: admissibility gate, then (only if passed) the existing
 * orchestrator's merits pipeline. CaseAnalysisOrchestrator itself is
 * never modified — it's passed in and used exactly as it already is for
 * CRIMINAL/CIVIL callers.
 */
export async function analyzeAdministrativeCase(
  request: AdministrativeCaseAnalysisRequest,
  orchestrator: CaseAnalysisOrchestrator,
): Promise<AdministrativeCaseAnalysisResult> {
  const admissibility = checkAdministrativeAdmissibility({
    facts: request.facts,
    evidence: request.evidence,
    applicableAt: request.applicableAt,
    conditionalElementIds: request.conditionalAdmissibilityElementIds,
    mappings: request.admissibilityMappings,
  });

  if (!admissibility.admissible) {
    return { admissible: false, admissibility, merits: null };
  }

  const merits = await orchestrator.analyze(request.merits);
  return { admissible: true, admissibility, merits };
}
