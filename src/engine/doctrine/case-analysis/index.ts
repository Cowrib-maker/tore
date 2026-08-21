export type {
  CaseAnalysisConclusion,
  CaseAnalysisRequest,
  CaseAnalysisResult,
  CaseAnalysisReview,
  CaseReviewWorkspacePayload,
  CaseIntakeFactView,
  CaseIntakeEvidenceView,
  CaseAnalysisTrace,
  CaseAnalysisTraceStep,
  CaseCounterargument,
} from "./types";

export type {
  CandidateLegalIssue,
  IssueSpottingResult,
  IIssueSpotter,
} from "./issue-spotter";
export { RuleBasedIssueSpotter } from "./issue-spotter";

export type {
  RetrievedLegalRule,
  RuleRetrievalQuery,
  IRuleRetriever,
} from "./rule-retriever";
export {
  EmptyRuleRetriever,
  InMemoryRuleRetriever,
  assertRuleSupported,
} from "./rule-retriever";

export type { KnowledgeRuleRetrieverOptions } from "./knowledge-rule-retriever";
export {
  KNOWLEDGE_AUTHORITATIVE_MIN_SCORE,
  KnowledgeRuleRetriever,
  resolveKnowledgeDomain,
} from "./knowledge-rule-retriever";

export type {
  ExtractedLegalTest,
  ILegalTestExtractor,
  LegalTestExtractionQuery,
} from "./legal-test-extractor";
export {
  EmptyLegalTestExtractor,
  SourceGroundedLegalTestExtractor,
  bindFactsToElements,
  createLegalTestExtractor,
} from "./legal-test-extractor";

export type {
  ExplicitFactMappingInput,
  FactElementMapping,
  FactMappingInput,
  FactMappingResult,
  IFactElementMapper,
  MappingProvenance,
} from "./fact-element-mapping";
export {
  DeterministicFactElementMapper,
  createFactElementMapper,
  evaluateElementMappings,
  mappingIsAdequate,
  tokenizeContent,
} from "./fact-element-mapping";

export { buildCaseAnalysisReview } from "./review";

export type {
  ElementApplication,
  ElementApplicationResult,
  ISubsumptionEngine,
  SubsumptionEngineResult,
} from "./subsumption";
export { DefaultSubsumptionEngine } from "./subsumption";

export type {
  ILegalReasoningModel,
  LegalArgumentDraft,
} from "./llm-port";
export { NullLegalReasoningModel } from "./llm-port";

export type { CaseAnalysisOrchestratorDependencies } from "./orchestrator";
export {
  CaseAnalysisOrchestrator,
  createCaseAnalysisOrchestrator,
} from "./orchestrator";
