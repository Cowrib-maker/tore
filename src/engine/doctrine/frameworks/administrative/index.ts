export { METHODOLOGY_SOURCE_ID, methodologyProvenance } from "./provenance";

export {
  AdministrativeDefectKind,
  AdministrativeRemedyClaimKind,
  ADMINISTRATIVE_DEFECT_CONSEQUENCES,
  ADMINISTRATIVE_REMEDY_CLAIMS,
  findDefectConsequence,
  type AdministrativeDefectConsequence,
  type AdministrativeRemedyClaim,
} from "./legal-consequence";

export {
  AdministrativeDisputeSubject,
  ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS,
} from "./dispute-subject";

export {
  ACT_CLASSIFICATION_TEST_ID,
  createActClassificationTest,
} from "./act-classification-test";

export {
  COMPETENCE_CONCEPT,
  FORMAL_LEGALITY_CATEGORIES,
  FORMAL_LEGALITY_ELEMENTS,
  FORMAL_LEGALITY_TEST_ID,
  createFormalLegalityTest,
  type FormalLegalityCategory,
} from "./formal-legality-test";

export {
  SUBSTANTIVE_LEGALITY_ELEMENTS,
  SUBSTANTIVE_LEGALITY_TEST_ID,
  createSubstantiveLegalityTest,
} from "./substantive-legality-test";

export {
  ADMISSIBILITY_ALL_ELEMENTS,
  ADMISSIBILITY_CONDITIONAL_ELEMENTS,
  ADMISSIBILITY_MANDATORY_ELEMENTS,
  ADMISSIBILITY_TEST_ID,
  createAdmissibilityTest,
} from "./admissibility-test";

// checkAdministrativeAdmissibility is deliberately NOT exported here (see
// admissibility-check.ts's file header) — analyzeAdministrativeCase is the
// only public entry point for administrative case analysis.
export {
  analyzeAdministrativeCase,
  type AdministrativeAdmissibilityRequest,
  type AdministrativeAdmissibilityResult,
  type AdministrativeCaseAnalysisRequest,
  type AdministrativeCaseAnalysisResult,
} from "./admissibility-check";

export { SourceBackedAdministrativeDoctrineFramework } from "./framework";
