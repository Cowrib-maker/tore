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
