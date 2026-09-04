import mn from "dictionary-mn";
import nspell from "nspell";

export type HunspellWordSuggestion = {
  sourceWord: string;
  suggestedWord: string;
  candidates: readonly string[];
  start: number;
  end: number;
};

const WORD_RE = /[А-Яа-яӨөҮүЁёЪъЬьЫы]+(?:-[А-Яа-яӨөҮүЁёЪъЬьЫы]+)*/gu;
const CYRILLIC_RE = /^[А-Яа-яӨөҮүЁёЪъЬьЫы-]+$/u;

// The dictionary is based on the Mongolian Hunspell dictionary (dict-mn).
// It recognizes stems and affix combinations instead of treating every
// surface form as an unrelated dictionary entry.
const spell = nspell(mn);

function preserveCase(source: string, candidate: string): string {
  if (source === source.toUpperCase()) return candidate.toUpperCase();
  if (/^[А-ЯӨҮЁ]/u.test(source)) return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  return candidate;
}

export function buildHunspellWordSuggestions(text: string): HunspellWordSuggestion[] {
  const suggestions: HunspellWordSuggestion[] = [];

  for (const match of text.matchAll(WORD_RE)) {
    const sourceWord = match[0] ?? "";
    const start = match.index ?? 0;
    const end = start + sourceWord.length;

    // Names, abbreviations and mixed tokens are not guessed by this checker.
    if (!CYRILLIC_RE.test(sourceWord)) continue;
    if (sourceWord.length < 2) continue;
    if (spell.correct(sourceWord)) continue;

    const rawCandidates = spell.suggest(sourceWord);
    const candidates = Array.from(new Set(rawCandidates
      .filter(Boolean)
      .map((candidate) => preserveCase(sourceWord, candidate))))
      .slice(0, 8);

    if (candidates.length === 0) continue;

    suggestions.push({
      sourceWord,
      suggestedWord: candidates[0],
      candidates,
      start,
      end,
    });
  }

  return suggestions;
}
