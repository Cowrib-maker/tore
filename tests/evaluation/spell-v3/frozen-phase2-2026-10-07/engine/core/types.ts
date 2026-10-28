/**
 * TORE Spell Language Engine V1 — public analysis contract.
 *
 * Three verdicts, deliberately:
 *   VALID      — the token is accepted (lexicon, morphology, user dictionary,
 *                or a protected non-linguistic token such as a number/URL).
 *   MISSPELLED — there is POSITIVE evidence of an error (a deterministic rule
 *                fired and its correction is itself valid). Only this verdict
 *                ever carries suggestions.
 *   UNKNOWN    — the engine cannot decide. This is NOT an error: the word may
 *                be a name, a loanword, a rare word, or simply absent from the
 *                loaded data. UNKNOWN never produces a replacement.
 *
 * Precision over recall: when in doubt the answer is UNKNOWN.
 */

export type WordVerdict = "VALID" | "MISSPELLED" | "UNKNOWN";

export type TokenKind =
  | "WORD" // Cyrillic word, checkable
  | "ACRONYM" // ALL-CAPS (optionally with a hyphenated suffix: НҮБ-ын)
  | "NUMBER" // digits, dates, decimals, ordinals with suffix (10-р)
  | "URL"
  | "EMAIL"
  | "LATIN" // Latin-script word (foreign / identifier)
  | "MIXED" // Cyrillic + Latin / digits in one token
  | "INITIAL" // a name initial before its dot: Б. Болд, Д.Сүхбаатар (the dot stays PUNCT)
  | "PHONE" // +976 9911 2233, 9911 2233
  | "HASHTAG" // #хууль
  | "MENTION" // @tore_mn
  | "PATH" // C:\Users\bold\a.docx, /usr/local/bin
  | "CODE" // `inline code`
  | "SUFFIX" // «хурим»-ыг, 2012-д : an inflectional suffix hyphenated to a quote/number; judged with its host, never alone
  | "PUNCT"
  | "SPACE";

export type CaseShape = "LOWER" | "TITLE" | "UPPER" | "MIXED" | "NONE";

export type LexiconLayer =
  | "GENERAL"
  | "LEGAL"
  | "GOVERNMENT"
  | "BUSINESS"
  | "ACADEMIC"
  | "TECH"
  | "MEDICAL"
  | "PROPER_NOUN"
  | "ABBREVIATION"
  | "USER_DEFINED";

/**
 * Why a verdict was reached. Every issue carries one, so each correction has
 * a measurable category and the benchmark can report per-reason precision.
 */
export type ReasonCode =
  // VALID
  | "LEXICON"
  | "MORPHOLOGY"
  | "USER_DICTIONARY"
  | "RESEARCH_LEXICON" // developer build only: accepted by a local research lexicon
  | "PROTECTED_NUMBER"
  | "PROTECTED_URL"
  | "PROTECTED_EMAIL"
  | "PROTECTED_LATIN"
  | "PROTECTED_ACRONYM"
  | "PROTECTED_PROPER_NOUN"
  | "PROTECTED_MIXED"
  | "PROTECTED_INITIAL"
  | "PROTECTED_IDENTIFIER"
  | "PROTECTED_SUFFIX"
  // UNKNOWN
  | "NOT_IN_LEXICON"
  | "PROPER_NOUN_CANDIDATE"
  | "ACRONYM_UNLISTED"
  | "UPPERCASE_UNLISTED"
  // MISSPELLED
  | "TYPO_PAIR"
  | "HARMONY_SUFFIX"
  | "SUFFIX_CONSONANT_CONFUSION"
  | "STEM_VOWEL_MISSING"
  | "YI_FEMININE_STEM"
  | "DOUBLED_FINAL_LETTER"
  | "DIGIT_GLUED"
  | "MIXED_SCRIPT_LOOKALIKE"
  | "DIGRAPH_II_FOR_IY"
  | "HARMONY_VIOLATION_NEIGHBOR"
  | "EDIT_DISTANCE_UNIQUE";

export type Severity = "ERROR" | "WARNING" | "INFO";

export type Suggestion = {
  text: string;
  /** 0..1 — confidence this exact replacement is right, given the word IS wrong. */
  confidence: number;
  /** The rule/evidence family that produced it (same vocabulary as the issue's reasonCode). */
  reason?: ReasonCode;
  /** Short, machine-readable evidence tags: «lexicon-verified», «ambiguous-with:гараас», … */
  evidence?: string[];
  /** Always false until a benchmark proves a reason code safe to apply without asking (never silently mutate text). */
  autoApplySafe?: boolean;
};

export type TextRange = { start: number; end: number };

export type Token = {
  kind: TokenKind;
  /** Exactly as it appears in the input (offsets are into the ORIGINAL text). */
  text: string;
  range: TextRange;
  caseShape: CaseShape;
  /** True when the token opens a sentence (so Title-case is not evidence of a name). */
  sentenceInitial: boolean;
};

export type TokenAnalysis = {
  token: Token;
  normalizedToken: string;
  verdict: WordVerdict;
  reasonCode: ReasonCode;
  /** Confidence in the VERDICT itself (not in any suggestion). */
  detectionConfidence: number;
  /** Lemma when morphology recognised the word. */
  lemma?: string;
  layer?: LexiconLayer;
};

export type SpellIssue = {
  token: string;
  normalizedToken: string;
  verdict: "MISSPELLED" | "UNKNOWN";
  reasonCode: ReasonCode;
  detectionConfidence: number;
  suggestions: readonly Suggestion[];
  /**
   * CONFIDENT: one clearly best repair. AMBIGUOUS: the word is wrong but two or more repairs are about equally
   * plausible — the list is offered WITHOUT a claimed best («Тодорхойгүй»). NONE: no defensible repair.
   */
  suggestionStatus: "CONFIDENT" | "AMBIGUOUS" | "NONE";
  /** Confidence of the top suggestion (0 when there is none). */
  suggestionConfidence: number;
  severity: Severity;
  range: TextRange;
  /** Always false until a benchmark proves a reason code safe to auto-apply. */
  autoApplySafe: boolean;
  /** Mongolian explanation for the user. */
  message: string;
};

export type AnalysisOptions = {
  /** Also return UNKNOWN tokens as INFO issues (default false: they are not errors). */
  reportUnknown?: boolean;
  /** Minimum detection confidence for a MISSPELLED issue (default from policy). */
  minDetectionConfidence?: number;
  /** Maximum suggestions per issue (default 3). */
  maxSuggestions?: number;
};

export type AnalysisStats = {
  characterCount: number;
  wordCount: number;
  validCount: number;
  misspelledCount: number;
  unknownCount: number;
  protectedCount: number;
};

export type AnalysisResult = {
  engineVersion: string;
  dataPackVersion: string;
  tokens: readonly TokenAnalysis[];
  issues: readonly SpellIssue[];
  stats: AnalysisStats;
};
