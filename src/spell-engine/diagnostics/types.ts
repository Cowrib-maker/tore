import type { LexiconLayer, ReasonCode, Suggestion, TextRange } from "../core/types";

/**
 * The unified result type of the whole language stack (spelling today; grammar, punctuation, style later). The desktop
 * product and any integration (Word, browser, system-wide) consume ONLY this, so a new module never changes them.
 */
export type DiagnosticType = "SPELLING" | "MORPHOLOGY" | "CAPITALIZATION" | "WORD_BOUNDARY" | "GRAMMAR" | "PUNCTUATION" | "STYLE" | "UNKNOWN";

/** Public, stable reason vocabulary (internal ReasonCodes map onto it; see reasons.ts). */
export type PublicReason =
  | "KNOWN_VALID"
  | "KNOWN_PROPER_NOUN"
  | "KNOWN_ABBREVIATION"
  | "VALID_MORPHOLOGY"
  | "VALID_DOMAIN_TERM"
  | "UNKNOWN_WORD"
  | "LIKELY_TYPO"
  | "INVALID_SUFFIX"
  | "INVALID_HARMONY"
  | "INVALID_FORM"
  | "CONTEXTUAL_ANOMALY"
  | "DUPLICATE_WORD"
  | "EXTRA_SPACE"
  | "SPACE_BEFORE_PUNCTUATION"
  | "GLUED_WORDS"
  | "SPLIT_SUFFIX"
  | "SENTENCE_START_LOWERCASE"
  | "PROPER_NOUN_LOWERCASE";

/** Explainable per-candidate scores (all 0..1; `context` is null when no context model is loaded). */
export type ScoreBreakdown = {
  lexical: number;
  morphology: number;
  /** null when the loaded data has no frequency information (never invented). */
  frequency: number | null;
  errorModel: number;
  domain: number;
  context: number | null;
  combined: number;
};

export type DiagnosticSuggestion = Suggestion & { scores?: ScoreBreakdown };

export type LanguageDiagnostic = {
  /** Stable within one result. */
  id: string;
  type: DiagnosticType;
  /** MISSPELLED/ERROR-class findings, UNKNOWN (cannot judge — not an error), ADVISORY (style-like nudge). */
  verdict: "MISSPELLED" | "UNKNOWN" | "ADVISORY";
  severity: "ERROR" | "WARNING" | "INFO";
  /** Offsets into the exact original string; `end` exclusive. */
  range: TextRange;
  original: string;
  message: string;
  reason: PublicReason;
  internalReason?: ReasonCode;
  suggestions: DiagnosticSuggestion[];
  suggestionStatus: "CONFIDENT" | "AMBIGUOUS" | "NONE";
  /** Which module produced it (for measurement and support). */
  source: string;
  /** Domain layer that supplied evidence, when relevant. */
  domain?: LexiconLayer;
};

export type DiagnoseOptions = {
  /** Also return UNKNOWN words as INFO diagnostics (default false: they are not errors). */
  reportUnknown?: boolean;
  /** Skip advisory (non-error) modules. */
  errorsOnly?: boolean;
};

/** A pluggable analysis stage. Modules are pure and deterministic. */
export interface DiagnosticModule {
  readonly id: string;
  readonly version: string;
  analyze(context: ModuleContext): LanguageDiagnostic[];
}

import type { SpellEngineV1 } from "../core/engine";
import type { Token } from "../core/types";

export type ModuleContext = {
  text: string;
  /** Tokenised ONCE for the whole pipeline (all kinds, incl. SPACE/PUNCT). */
  tokens: readonly Token[];
  engine: SpellEngineV1;
  options: DiagnoseOptions;
};
