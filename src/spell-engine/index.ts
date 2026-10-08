export type {
  CheckRequest,
  CheckResult,
  EngineIdentity,
  EngineInfo,
  IssueCategory,
  LanguageEngine,
  LanguageIssue,
  Suggestion,
  TextSpan,
} from "./contracts";
export type {
  CandidateGenerator,
  MorphologicalAnalysis,
  MorphologicalAnalyzer,
  SpellingDetector,
  SuggestionRanker,
  Token,
  Tokenizer,
} from "./pipeline";
export { EngineRegistry } from "./registry";
export { checkResultViolations } from "./conformance";

// ── Language Engine V1 (feature-flagged at the application layer) ──
export { SpellEngineV1, applyCase } from "./core/engine";
export type { SpellEngineConfig, TypoPair } from "./core/engine";
export { createSpellEngineV1, BUNDLED_PACKS, BUNDLED_TYPO_PAIRS } from "./bundled";
export { UserDictionary } from "./lexicon/user-dictionary";
export { Lexicon, PackValidationError } from "./lexicon/lexicon";
export { validatePack, PACK_SCHEMA, packsAtTier, tierOf, DATA_TIERS } from "./lexicon/pack-schema";
export type { DataPack, PackEntry, DataTier } from "./lexicon/pack-schema";
export { MorphAnalyzer } from "./morphology/analyzer";
export { lex } from "./tokenizer/lexer";
export { SPELL_ENGINE_VERSION } from "./core/versions";
export type * from "./core/types";
export type { ExternalLexiconProvider, ResearchPolicy } from "./research/provider";
export { ResearchDataForbiddenError } from "./research/provider";

// ── Diagnostics (unified issue type; pluggable modules) ──
export { DiagnosticPipeline } from "./diagnostics/pipeline";
export { BoundaryModule } from "./diagnostics/boundary";
export { CapitalizationModule } from "./diagnostics/capitalization";
export { publicReason, diagnosticTypeOf } from "./diagnostics/reasons";
export { scoreCandidate, SCORE_WEIGHTS } from "./ranking/scores";
export type { DiagnosticModule, DiagnoseOptions, DiagnosticType, LanguageDiagnostic, ModuleContext, PublicReason, ScoreBreakdown } from "./diagnostics/types";
export { ERROR_MODEL_VERSION } from "./ranking/rank";
export { SPELL_RULES_VERSION } from "./core/versions";

// ── Context (real-word errors, re-ranking) ──
export { NGramContextModel } from "./context/ngram";
export { RealWordContextModule, buildConfusionSets } from "./context/real-word";
export type { ContextModel, NGramData } from "./context/types";

// ── Review pipeline (native review infrastructure; honest status labels) ──
export {
  REVIEW_SCHEMA, REVIEW_CATEGORIES, EXPORT_COLUMNS, actionOf, appendDecision, exportQueueTsv, importDecisionsTsv, isNativeGold, itemState,
  reviewQueue, standingDecisions, summarize as summarizeReview, validateDecision, validateItem,
} from "./review/review";
export type { FormJudgment, ItemState, LemmaCorrection, LemmaProposal, ReviewAction, ReviewCategory, ReviewDecision, ReviewerKind, ReviewStatus, SentenceOrigin, SpellReviewItem, Verdict as ReviewVerdict } from "./review/review";
export { paradigmAudit, paradigmGold } from "./review/paradigm-audit";
export type { ParadigmAudit, ParadigmGoldForm } from "./review/paradigm-audit";
