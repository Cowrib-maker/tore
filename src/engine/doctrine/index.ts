/**
 * TORE Legal Doctrine + Legal Reasoning foundation.
 *
 * Layering: Legal Data → Legal Knowledge → Legal Doctrine → Legal Reasoning
 *
 * Doctrine remains distinct from positive law, court decisions,
 * administrative regulations, and AI inference.
 *
 * Does not populate a doctrine corpus, scrape sources, call LLMs as authority,
 * or alter LegalInfo ingestion / UI.
 */

export {
  CaseAnalysisStage,
  ConclusionDisposition,
  ElementExtractionKind,
  FactElementRelation,
  MappingConfidence,
  MappingMethod,
  LegalAuthorityKind,
  LegalConflictKind,
  LegalDomain,
  LegalIssueKind,
  LegalReasoningStepKind,
  LegalReasoningStepStatus,
  ReasoningSupportStatus,
  SourceBackedClaimKind,
  SubsumptionMatchStatus,
  emptyTemporal,
} from "./types";
export type {
  CaseAnalysisStage as CaseAnalysisStageType,
  ConclusionDisposition as ConclusionDispositionType,
  ElementExtractionKind as ElementExtractionKindType,
  FactElementRelation as FactElementRelationType,
  MappingConfidence as MappingConfidenceType,
  MappingMethod as MappingMethodType,
  LegalIssueKind as LegalIssueKindType,
  TemporalApplicability,
} from "./types";

export type {
  DoctrineProvenance,
  SourceBackedSupport,
} from "./provenance";
export {
  collectNonAiSourceIds,
  evaluateSourceBackedSupport,
  isNonAiProvenance,
} from "./provenance";

export { filterApplicableAt, isApplicableAt } from "./temporal";

export type {
  LegalDomainClassificationContract,
  LegalIssueClassification,
} from "./classification";
export { RuleBasedLegalDomainClassifier } from "./classification";

export type { LegalConflict } from "./conflict";
export {
  createDoctrineConflict,
  createSourceConflict,
  createUnresolvedIssueConflict,
} from "./conflict";

export type {
  LegalConcept,
  LegalConclusion,
  LegalDoctrine,
  LegalElement,
  LegalEvidence,
  LegalFact,
  LegalInterpretation,
  LegalIssue,
  LegalRule,
  LegalTest,
} from "./models";

export type {
  FrameworkContext,
  FrameworkIssueSelection,
  FrameworkTestSelection,
  IAdministrativeDoctrineFramework,
  ICivilDoctrineFramework,
  ICriminalDoctrineFramework,
} from "./frameworks";
export {
  ADMINISTRATIVE_ISSUE_KINDS,
  CIVIL_ISSUE_KINDS,
  CRIMINAL_ISSUE_KINDS,
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  issueKindsForDomain,
} from "./frameworks";

export type {
  ILegalReasoningPipeline,
  ILegalReasoningSupportEvaluator,
  ILegalReasoningTraceBuilder,
  ILegalReasoningValidator,
  LegalReasoningPipelineDependencies,
  LegalReasoningRequest,
  LegalReasoningResult,
  LegalReasoningStep,
  LegalReasoningTrace,
  LegalReasoningValidation,
  SourceBackedSupportReport,
  SubsumptionAssessment,
} from "./reasoning";
export {
  DefaultLegalReasoningPipeline,
  DefaultLegalReasoningSupportEvaluator,
  DefaultLegalReasoningTraceBuilder,
  DefaultLegalReasoningValidator,
  aiInferenceProvenance,
  createLegalReasoningPipeline,
} from "./reasoning";

export type {
  CaseAnalysisConclusion,
  CaseAnalysisOrchestratorDependencies,
  CaseAnalysisRequest,
  CaseAnalysisResult,
  CaseAnalysisReview,
  CaseReviewWorkspacePayload,
  CaseIntakeFactView,
  CaseIntakeEvidenceView,
  CaseAnalysisTrace,
  CaseAnalysisTraceStep,
  CaseCounterargument,
  CandidateLegalIssue,
  ElementApplication,
  ElementApplicationResult,
  IIssueSpotter,
  ILegalReasoningModel,
  IRuleRetriever,
  ISubsumptionEngine,
  IssueSpottingResult,
  LegalArgumentDraft,
  RetrievedLegalRule,
  RuleRetrievalQuery,
  ExtractedLegalTest,
  ILegalTestExtractor,
  LegalTestExtractionQuery,
  ExplicitFactMappingInput,
  FactElementMapping,
  IFactElementMapper,
  SubsumptionEngineResult,
} from "./case-analysis";
export {
  CaseAnalysisOrchestrator,
  DefaultSubsumptionEngine,
  DeterministicFactElementMapper,
  EmptyLegalTestExtractor,
  EmptyRuleRetriever,
  InMemoryRuleRetriever,
  KNOWLEDGE_AUTHORITATIVE_MIN_SCORE,
  KnowledgeRuleRetriever,
  NullLegalReasoningModel,
  RuleBasedIssueSpotter,
  SourceGroundedLegalTestExtractor,
  assertRuleSupported,
  bindFactsToElements,
  buildCaseAnalysisReview,
  createCaseAnalysisOrchestrator,
  createFactElementMapper,
  createLegalTestExtractor,
  evaluateElementMappings,
  mappingIsAdequate,
  resolveKnowledgeDomain,
} from "./case-analysis";

export type {
  DoctrineEngineDependencies,
  DoctrineIssueDraft,
  IDoctrineRepository,
} from "./interfaces";
export { InMemoryDoctrineRepository } from "./interfaces";

export {
  DoctrineService,
  createDoctrineEngine,
} from "./doctrine.service";
export type { DoctrineEngineDependenciesWithCaseAnalysis } from "./doctrine.service";

// checkAdministrativeAdmissibility is deliberately NOT exported —
// analyzeAdministrativeCase is the only public entry point for
// administrative case analysis (see admissibility-check.ts).
export {
  ADMINISTRATIVE_DEFECT_CONSEQUENCES,
  ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS,
  ADMINISTRATIVE_REMEDY_CLAIMS,
  ADMISSIBILITY_ALL_ELEMENTS,
  ADMISSIBILITY_CONDITIONAL_ELEMENTS,
  ADMISSIBILITY_MANDATORY_ELEMENTS,
  ADMISSIBILITY_TEST_ID,
  ACT_CLASSIFICATION_TEST_ID,
  AdministrativeDefectKind,
  AdministrativeDisputeSubject,
  AdministrativeRemedyClaimKind,
  COMPETENCE_CONCEPT,
  FORMAL_LEGALITY_CATEGORIES,
  FORMAL_LEGALITY_ELEMENTS,
  FORMAL_LEGALITY_TEST_ID,
  METHODOLOGY_SOURCE_ID,
  SUBSTANTIVE_LEGALITY_ELEMENTS,
  SUBSTANTIVE_LEGALITY_TEST_ID,
  SourceBackedAdministrativeDoctrineFramework,
  analyzeAdministrativeCase,
  createActClassificationTest,
  createAdmissibilityTest,
  createFormalLegalityTest,
  createSubstantiveLegalityTest,
  findDefectConsequence,
  methodologyProvenance,
  type AdministrativeAdmissibilityRequest,
  type AdministrativeAdmissibilityResult,
  type AdministrativeCaseAnalysisRequest,
  type AdministrativeCaseAnalysisResult,
  type AdministrativeDefectConsequence,
  type AdministrativeRemedyClaim,
  type FormalLegalityCategory,
} from "./frameworks/administrative";
