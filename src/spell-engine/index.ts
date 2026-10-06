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
export { validatePack, PACK_SCHEMA } from "./lexicon/pack-schema";
export type { DataPack, PackEntry } from "./lexicon/pack-schema";
export { MorphAnalyzer } from "./morphology/analyzer";
export { lex } from "./tokenizer/lexer";
export { SPELL_ENGINE_VERSION } from "./core/versions";
export type * from "./core/types";
