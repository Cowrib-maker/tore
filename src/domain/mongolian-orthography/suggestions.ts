import { getOrthographyRule, type OrthographyIssue, type OrthographyIssueCode } from "@/domain/mongolian-orthography";
import { isKnownMongolianWord, suggestDictionaryWords, suggestRootSimilarWords } from "@/domain/mongolian-orthography/dictionary";
import { normalizeMongolianWord, scanMongolianText } from "@/domain/mongolian-orthography/engine";
import { findLatinToCyrillicSuggestions, type LatinToCyrillicSuggestion } from "@/domain/mongolian-orthography/latin-to-cyrillic";

export type OrthographySuggestion = {
  kind: "ORTHOGRAPHY" | "LATIN_TO_CYRILLIC" | "SPELLING";
  sourceWord: string;
  suggestedWord: string;
  suggestionLabel: string;
  ruleIds: readonly string[];
  ruleTitle: string | null;
  start: number;
  end: number;
  /** Dictionary words sharing an approximate Mongolian stem/root. */
  relatedWords?: readonly string[];
};

export type OrthographyCheckResult = {
  suggestions: OrthographySuggestion[];
  suggestionCount: number;
  orthographyCount: number;
  latinCount: number;
  spellingCount: number;
  wordCount: number;
  characterCount: number;
};

const WORD_RE = /[A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫы]+(?:-[A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫы]+)*/gu;

function suggestForIssue(issue: OrthographyIssue, span: { start: number; end: number; surface: string }): OrthographySuggestion | null {
  const rule = issue.ruleIds[0] ? getOrthographyRule(issue.ruleIds[0]) : null;
  if (issue.code !== "YI_IN_FEMININE") return null;
  const suggested = applyFeminineYiFix(issue.word);
  if (!suggested || suggested === issue.word) return null;
  return { kind: "ORTHOGRAPHY", sourceWord: span.surface, suggestedWord: suggested, suggestionLabel: `Зөв хувилбар: «${suggested}» (§10 эм үгэнд ий)`, ruleIds: issue.ruleIds, ruleTitle: rule?.title ?? null, start: span.start, end: span.end, relatedWords: suggestRootSimilarWords(span.normalized, 5) };
}

export function applyFeminineYiFix(word: string): string | null {
  const normalized = normalizeMongolianWord(word);
  if (!normalized.includes("ы")) return null;
  let next = normalized.replace(/ыг$/u, "ийг").replace(/ын$/u, "ийн").replace(/ы$/u, "ий");
  if (next.includes("ы")) next = next.replace(/ы/gu, "ий");
  return next === normalized ? null : next;
}

type WordSpan = { surface: string; normalized: string; start: number; end: number };

function collectWordSpans(text: string): WordSpan[] {
  const spans: WordSpan[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const surface = match[0] ?? "";
    const normalized = normalizeMongolianWord(surface);
    if (!normalized || !/[а-яөүё]/u.test(normalized)) continue;
    spans.push({ surface, normalized, start: match.index ?? 0, end: (match.index ?? 0) + surface.length });
  }
  return spans;
}

function suggestDictionaryForSpan(span: WordSpan, options?: { highConfidenceOnly?: boolean }): OrthographySuggestion | null {
  if (isKnownMongolianWord(span.normalized)) return null;
  const candidates = suggestDictionaryWords(span.normalized, 1, options);
  const suggested = candidates[0];
  if (!suggested || suggested === span.normalized) return null;
  return { kind: "SPELLING", sourceWord: span.surface, suggestedWord: suggested, suggestionLabel: `Зөв бичих: «${suggested}»`, ruleIds: ["§1"], ruleTitle: "Үгийн зөв бичлэг", start: span.start, end: span.end, relatedWords: suggestRootSimilarWords(span.normalized, 5) };
}

function countWords(text: string): number { const trimmed = text.trim(); return trimmed ? trimmed.split(/\s+/u).filter(Boolean).length : 0; }

export function buildOrthographySuggestions(text: string, options?: { includeLatinToCyrillic?: boolean }): OrthographyCheckResult {
  const spans = collectWordSpans(text);
  const spanByNormalized = new Map<string, WordSpan>();
  for (const span of spans) if (!spanByNormalized.has(span.normalized)) spanByNormalized.set(span.normalized, span);
  const rawIssues = dedupeHarmonyWhenYiFixable(scanMongolianText(text));
  const harmonyOnlyWords = new Set(rawIssues.filter((item) => item.code === "VOWEL_HARMONY").map((item) => item.word));
  const orthography: OrthographySuggestion[] = [];
  const usedKeys = new Set<string>();
  for (const issue of rawIssues) {
    const span = spanByNormalized.get(issue.word);
    if (!span) continue;
    const key = `${span.start}:${span.end}`;
    if (usedKeys.has(key)) continue;
    const suggestion = suggestForIssue(issue, span);
    if (!suggestion) continue;
    usedKeys.add(key); orthography.push(suggestion);
  }
  const spelling: OrthographySuggestion[] = [];
  for (const span of spans) {
    const key = `${span.start}:${span.end}`;
    if (usedKeys.has(key)) continue;
    const suggestion = suggestDictionaryForSpan(span, { highConfidenceOnly: harmonyOnlyWords.has(span.normalized) });
    if (!suggestion) continue;
    usedKeys.add(key); spelling.push(suggestion);
  }
  const latin: OrthographySuggestion[] = options?.includeLatinToCyrillic ? findLatinToCyrillicSuggestions(text).map((item) => latinToSuggestion(item, text)) : [];
  const suggestions = [...orthography, ...spelling, ...latin].sort((a, b) => a.start - b.start || a.end - b.end);
  return { suggestions, suggestionCount: suggestions.length, orthographyCount: orthography.length, latinCount: latin.length, spellingCount: spelling.length, wordCount: countWords(text), characterCount: text.length };
}

function latinToSuggestion(item: LatinToCyrillicSuggestion, text: string): OrthographySuggestion {
  const index = text.toLowerCase().indexOf(item.sourceWord.toLowerCase());
  const start = index >= 0 ? index : 0;
  return { kind: "LATIN_TO_CYRILLIC", sourceWord: item.sourceWord, suggestedWord: item.suggestedWord, suggestionLabel: item.label, ruleIds: [], ruleTitle: null, start, end: start + item.sourceWord.length };
}

function dedupeHarmonyWhenYiFixable(issues: OrthographyIssue[]): OrthographyIssue[] {
  const yiWords = new Set(issues.filter((item) => item.code === "YI_IN_FEMININE").map((item) => item.word));
  if (!yiWords.size) return issues;
  return issues.filter((item) => !(item.code === "VOWEL_HARMONY" && yiWords.has(item.word)));
}

export function replaceSuggestedWord(text: string, sourceWord: string, suggestedWord: string): string {
  const pattern = new RegExp(`(^|[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü'])(${escapeRegExp(sourceWord)})(?=[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü']|$)`, "u");
  const withCase = text.replace(pattern, `$1${suggestedWord}`);
  if (withCase !== text) return withCase;
  return text.replace(new RegExp(escapeRegExp(sourceWord), "giu"), suggestedWord);
}

export function replaceAtSpan(text: string, start: number, end: number, suggestedWord: string): string { if (start < 0 || end > text.length || start >= end) return text; return `${text.slice(0, start)}${suggestedWord}${text.slice(end)}`; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export type { OrthographyIssueCode, LatinToCyrillicSuggestion };
