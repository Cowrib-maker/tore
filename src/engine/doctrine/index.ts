/**
 * TORE Legal Doctrine + Legal Reasoning foundation.
 *
 * Layering: Legal Data → Legal Knowledge → Legal Doctrine → Legal Reasoning
 *
 * Doctrine remains distinct from positive law, court decisions,
 * administrative regulations, and AI inference.
 *
 * Does not populate a doctrine corpus, scrape sources, call LLMs,
 * or alter LegalInfo ingestion / UI.
 */

export {
  LegalAuthorityKind,
  LegalConflictKind,
  LegalDomain,
  LegalReasoningStepKind,
  LegalReasoningStepStatus,
  ReasoningSupportStatus,
  SourceBackedClaimKind,
  SubsumptionMatchStatus,
  emptyTemporal,
} from "./types";
export type { TemporalApplicability } from "./types";

export type {
  DoctrineProvenance,
  SourceBackedSupport,
} from "./provenance";
export {
  collectNonAiSourceIds,
  evaluateSourceBackedSupport,
  isNonAiProvenance,
} from "./provenance";

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
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
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
  DoctrineEngineDependencies,
  DoctrineIssueDraft,
  IDoctrineRepository,
} from "./interfaces";
export { InMemoryDoctrineRepository } from "./interfaces";

export { DoctrineService, createDoctrineEngine } from "./doctrine.service";
