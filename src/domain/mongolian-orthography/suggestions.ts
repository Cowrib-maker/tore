import {
  getOrthographyRule,
  type OrthographyIssue,
  type OrthographyIssueCode,
} from "@/domain/mongolian-orthography";
import {
  isKnownMongolianWord,
  suggestDictionaryWords,
  suggestPhraseSplit,
} from "@/domain/mongolian-orthography/dictionary";
import {
  normalizeMongolianWord,
  scanMongolianText,
} from "@/domain/mongolian-orthography/engine";
import {
  findLatinToCyrillicSuggestions,
  type LatinToCyrillicSuggestion,
} from "@/domain/mongolian-orthography/latin-to-cyrillic";

export type OrthographySuggestion = {
  kind: "ORTHOGRAPHY" | "LATIN_TO_CYRILLIC" | "SPELLING";
  sourceWord: string;
  /** Concrete correct / converted form — only emitted when known. Always
   * equal to `candidates[0]` when `candidates` is present. */
  suggestedWord: string;
  suggestionLabel: string;
  ruleIds: readonly string[];
  ruleTitle: string | null;
  /** Inclusive start, exclusive end in the checked text. */
  start: number;
  end: number;
  /** Ranked alternatives (best first) for a popup with more than one
   * option — only present for dictionary/fuzzy spelling suggestions. */
  candidates?: readonly string[];
};

export type OrthographyCheckResult = {
  /** Only incorrect / convertible words with a concrete suggested form. */
  suggestions: OrthographySuggestion[];
  suggestionCount: number;
  orthographyCount: number;
  latinCount: number;
  spellingCount: number;
  wordCount: number;
  characterCount: number;
};

const WORD_RE =
  /[A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫы]+(?:-[A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫы]+)*/gu;

/** A Cyrillic word with a digit glued straight onto it, no space or
 * hyphen — almost always a stray keystroke ("юу1"), never a legitimate
 * construct (ordinal citations like "20-р зүйл" always use a hyphen, so
 * they never match this pattern). */
const DIGIT_GLUED_WORD_RE = /[А-Яа-яӨөҮүЁё]+[0-9]+/gu;

function findDigitGlueSuggestions(text: string): OrthographySuggestion[] {
  const results: OrthographySuggestion[] = [];
  for (const match of text.matchAll(DIGIT_GLUED_WORD_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (text[start - 1] === "-") continue;
    const lettersOnly = raw.replace(/[0-9]+$/u, "");
    if (!lettersOnly || lettersOnly === raw) continue;
    results.push({
      kind: "SPELLING",
      sourceWord: raw,
      suggestedWord: lettersOnly,
      suggestionLabel: `Тоо санамсаргүй орсон бололтой: «${lettersOnly}»`,
      ruleIds: ["§1"],
      ruleTitle: "Үгийн зөв бичлэг",
      start,
      end: start + raw.length,
    });
  }
  return results;
}

function suggestForIssue(
  issue: OrthographyIssue,
  span: { start: number; end: number; surface: string },
): OrthographySuggestion | null {
  const rule = issue.ruleIds[0]
    ? getOrthographyRule(issue.ruleIds[0])
    : null;

  if (issue.code === "YI_IN_FEMININE") {
    const suggested = applyFeminineYiFix(issue.word);
    if (!suggested || suggested === issue.word) return null;
    return {
      kind: "ORTHOGRAPHY",
      sourceWord: span.surface,
      suggestedWord: suggested,
      suggestionLabel: `Зөв хувилбар: «${suggested}» (§10 эм үгэнд ий)`,
      ruleIds: issue.ruleIds,
      ruleTitle: rule?.title ?? null,
      start: span.start,
      end: span.end,
    };
  }

  return null;
}

/** Deterministic §10 suffix repairs for feminine stems. */
export function applyFeminineYiFix(word: string): string | null {
  const normalized = normalizeMongolianWord(word);
  if (!normalized.includes("ы")) return null;

  let next = normalized;
  next = next.replace(/ыг$/u, "ийг");
  next = next.replace(/ын$/u, "ийн");
  next = next.replace(/ы$/u, "ий");
  if (next.includes("ы")) {
    next = next.replace(/ы/gu, "ий");
  }
  return next === normalized ? null : next;
}

type WordSpan = {
  surface: string;
  normalized: string;
  start: number;
  end: number;
};

function collectWordSpans(text: string): WordSpan[] {
  const spans: WordSpan[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const surface = match[0] ?? "";
    const normalized = normalizeMongolianWord(surface);
    if (!normalized || !/[а-яөүё]/u.test(normalized)) continue;
    spans.push({
      surface,
      normalized,
      start: match.index ?? 0,
      end: (match.index ?? 0) + surface.length,
    });
  }
  return spans;
}

const DOUBLED_FINAL_CONSONANT_RE = /([бвгджзйклмнпрстфхцчшщ])\1$/u;

/**
 * Catches typos like "байхх" (extra key press) that the morphology
 * suffix-stripper otherwise mistakes for a valid word, because many of
 * its single-letter suffixes (х, д, т, н, с, р, …) happen to equal the
 * duplicated letter itself.
 */
function findDoubledLetterSuggestion(
  span: WordSpan,
): OrthographySuggestion | null {
  if (span.normalized.length < 4) return null;
  if (!DOUBLED_FINAL_CONSONANT_RE.test(span.normalized)) return null;
  const deduped = span.normalized.slice(0, -1);
  if (!isKnownMongolianWord(deduped)) return null;
  return {
    kind: "SPELLING",
    sourceWord: span.surface,
    suggestedWord: deduped,
    suggestionLabel: `Давхар үсэг оржээ: «${deduped}»`,
    ruleIds: ["§1"],
    ruleTitle: "Үгийн зөв бичлэг",
    start: span.start,
    end: span.end,
  };
}

/**
 * Fallback for an unknown token with no useful single-word fuzzy
 * suggestion: two known words run together without a space (e.g.
 * "биздээ" -> "биз дээ"). See suggestPhraseSplit's own doc comment for
 * the safety design (exactly-one-valid-split, both halves independently
 * already known). Only reached after suggestDictionaryForSpan already
 * found nothing for this span — a real single-word correction always
 * takes priority over a phrase-boundary guess.
 */
function findPhraseSplitSuggestion(span: WordSpan): OrthographySuggestion | null {
  const suggested = suggestPhraseSplit(span.normalized);
  if (!suggested) return null;
  return {
    kind: "SPELLING",
    sourceWord: span.surface,
    suggestedWord: suggested,
    suggestionLabel: `Хоёр үг холбогдсон бололтой: «${suggested}»`,
    ruleIds: ["§1"],
    ruleTitle: "Үгийн зөв бичлэг",
    start: span.start,
    end: span.end,
  };
}

const MAX_SUGGESTED_CANDIDATES = 3;

/** Stricter-than-default confidence floor (module default: 0.4) applied
 * only to a word that already independently tripped the §8 vowel-harmony
 * rule — see the call site's own comment for why this replaced an
 * outright "only the exact typo map may answer" gate. Chosen with
 * margin above every real correction this milestone verified needs it
 * (0.598 for "надэд"/"засэж"), not tuned to a single case. */
const HARMONY_FLAGGED_MIN_CONFIDENCE = 0.55;

function suggestDictionaryForSpan(
  span: WordSpan,
  options?: {
    highConfidenceOnly?: boolean;
    documentWords?: ReadonlySet<string>;
    minConfidence?: number;
  },
): OrthographySuggestion | null {
  if (isKnownMongolianWord(span.normalized)) return null;
  const candidates = suggestDictionaryWords(span.normalized, MAX_SUGGESTED_CANDIDATES, options);
  const suggested = candidates[0];
  if (!suggested || suggested === span.normalized) return null;
  return {
    kind: "SPELLING",
    sourceWord: span.surface,
    suggestedWord: suggested,
    suggestionLabel: `Зөв бичих: «${suggested}»`,
    ruleIds: ["§1"],
    ruleTitle: "Үгийн зөв бичлэг",
    start: span.start,
    end: span.end,
    candidates,
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).filter(Boolean).length;
}

/**
 * Suggest-only checker: correct words stay silent; incorrect words get a
 * concrete variant when known. Latin→Cyrillic is optional (user opt-in in UI).
 */
export function buildOrthographySuggestions(
  text: string,
  options?: { includeLatinToCyrillic?: boolean },
): OrthographyCheckResult {
  const checkableText = stripLawAmendmentNotes(text);
  const spans = collectWordSpans(checkableText);
  const spanByNormalized = new Map<string, WordSpan>();
  for (const span of spans) {
    if (!spanByNormalized.has(span.normalized)) {
      spanByNormalized.set(span.normalized, span);
    }
  }

  const rawIssues = dedupeHarmonyWhenYiFixable(scanMongolianText(checkableText));
  // A word that already tripped the independent §8 vowel-harmony rule is
  // treated as more suspicious than an ordinary unknown token — but NOT
  // silenced down to "only the exact hardcoded typo map may answer"
  // (that used to be the behavior here, and it meant a real, well-scored
  // fuzzy correction — e.g. "надэд" -> "надад" at 0.60, well above the
  // ordinary 0.4 floor — was never surfaced just because the input also
  // happened to mix masculine/feminine vowels). Fuzzy ranking still runs,
  // gated by a STRICTER floor than the module default (never a looser
  // one) — see HARMONY_FLAGGED_MIN_CONFIDENCE below.
  const harmonyFlaggedWords = new Set(
    rawIssues
      .filter((item) => item.code === "VOWEL_HARMONY")
      .map((item) => item.word),
  );
  const orthography: OrthographySuggestion[] = [];
  const usedKeys = new Set<string>();

  for (const issue of rawIssues) {
    const span = spanByNormalized.get(issue.word);
    if (!span) continue;
    const key = `${span.start}:${span.end}`;
    if (usedKeys.has(key)) continue;
    const suggestion = suggestForIssue(issue, span);
    if (!suggestion) continue;
    usedKeys.add(key);
    orthography.push(suggestion);
  }

  // Cheap, deterministic local-context signal: a candidate already used
  // elsewhere in this same text is more likely the intended word than a
  // coincidental near-miss. No LLM call, no cross-request state.
  const documentWords = new Set(spans.map((span) => span.normalized));

  const spelling: OrthographySuggestion[] = [];
  for (const span of spans) {
    const key = `${span.start}:${span.end}`;
    if (usedKeys.has(key)) continue;
    const doubled = findDoubledLetterSuggestion(span);
    if (doubled) {
      usedKeys.add(key);
      spelling.push(doubled);
      continue;
    }
    const suggestion = suggestDictionaryForSpan(span, {
      minConfidence: harmonyFlaggedWords.has(span.normalized)
        ? HARMONY_FLAGGED_MIN_CONFIDENCE
        : undefined,
      documentWords,
    });
    if (suggestion) {
      usedKeys.add(key);
      spelling.push(suggestion);
      continue;
    }
    const phraseSplit = findPhraseSplitSuggestion(span);
    if (!phraseSplit) continue;
    usedKeys.add(key);
    spelling.push(phraseSplit);
  }

  const digitGlued = findDigitGlueSuggestions(checkableText);

  const latin: OrthographySuggestion[] = options?.includeLatinToCyrillic
    ? findLatinToCyrillicSuggestions(checkableText).map((item) =>
        latinToSuggestion(item, checkableText),
      )
    : [];

  const suggestions = [...orthography, ...spelling, ...digitGlued, ...latin].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  return {
    suggestions,
    suggestionCount: suggestions.length,
    orthographyCount: orthography.length,
    latinCount: latin.length,
    spellingCount: spelling.length + digitGlued.length,
    wordCount: countWords(text),
    characterCount: text.length,
  };
}

function latinToSuggestion(
  item: LatinToCyrillicSuggestion,
  text: string,
): OrthographySuggestion {
  const index = text.toLowerCase().indexOf(item.sourceWord.toLowerCase());
  const start = index >= 0 ? index : 0;
  return {
    kind: "LATIN_TO_CYRILLIC",
    sourceWord: item.sourceWord,
    suggestedWord: item.suggestedWord,
    suggestionLabel: item.label,
    ruleIds: [],
    ruleTitle: null,
    start,
    end: start + item.sourceWord.length,
  };
}

/**
 * Feminine stems with ы often also trip §8 because ы is masculine —
 * prefer the §10 fixable signal and drop the redundant harmony flag.
 */
function dedupeHarmonyWhenYiFixable(
  issues: OrthographyIssue[],
): OrthographyIssue[] {
  const yiWords = new Set(
    issues
      .filter((item) => item.code === "YI_IN_FEMININE")
      .map((item) => item.word),
  );
  if (yiWords.size === 0) return issues;
  return issues.filter(
    (item) => !(item.code === "VOWEL_HARMONY" && yiWords.has(item.word)),
  );
}

/** Replace one exact word occurrence (case-insensitive for Cyrillic match). */
export function replaceSuggestedWord(
  text: string,
  sourceWord: string,
  suggestedWord: string,
): string {
  const pattern = new RegExp(
    `(^|[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü'])(${escapeRegExp(sourceWord)})(?=[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü']|$)`,
    "u",
  );
  const withCase = text.replace(pattern, `$1${suggestedWord}`);
  if (withCase !== text) return withCase;

  const insensitive = new RegExp(
    `(^|[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü'])(${escapeRegExp(sourceWord)})(?=[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü']|$)`,
    "giu",
  );
  return text.replace(insensitive, `$1${suggestedWord}`);
}

/** Replace at exact span (preferred for spellcheck UI). */
export function replaceAtSpan(
  text: string,
  start: number,
  end: number,
  suggestedWord: string,
): string {
  if (start < 0 || end > text.length || start >= end) return text;
  return `${text.slice(0, start)}${suggestedWord}${text.slice(end)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Law amendment parentheticals (/…/) are citation metadata, not prose to spell-check. */
function stripLawAmendmentNotes(text: string): string {
  return text.replace(/\/[^/\n]{8,}\//gu, (match) =>
    " ".repeat(match.length),
  );
}

export type { OrthographyIssueCode, LatinToCyrillicSuggestion };
