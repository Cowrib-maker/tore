import {
  getOrthographyRule,
  type OrthographyIssue,
  type OrthographyIssueCode,
} from "@/domain/mongolian-orthography";
import {
  normalizeMongolianWord,
  scanMongolianText,
} from "@/domain/mongolian-orthography/engine";
import {
  findLatinToCyrillicSuggestions,
  type LatinToCyrillicSuggestion,
} from "@/domain/mongolian-orthography/latin-to-cyrillic";

export type OrthographySuggestion = {
  kind: "ORTHOGRAPHY" | "LATIN_TO_CYRILLIC";
  sourceWord: string;
  /** Concrete correct / converted form — only emitted when known. */
  suggestedWord: string;
  suggestionLabel: string;
  ruleIds: readonly string[];
  ruleTitle: string | null;
};

export type OrthographyCheckResult = {
  /** Only incorrect / convertible words with a concrete suggested form. */
  suggestions: OrthographySuggestion[];
  suggestionCount: number;
  orthographyCount: number;
  latinCount: number;
};

function suggestForIssue(issue: OrthographyIssue): OrthographySuggestion | null {
  const rule = issue.ruleIds[0]
    ? getOrthographyRule(issue.ruleIds[0])
    : null;

  if (issue.code === "YI_IN_FEMININE") {
    const suggested = applyFeminineYiFix(issue.word);
    if (!suggested || suggested === issue.word) return null;
    return {
      kind: "ORTHOGRAPHY",
      sourceWord: issue.word,
      suggestedWord: suggested,
      suggestionLabel: `Зөв хувилбар: «${suggested}» (§10 эм үгэнд ий)`,
      ruleIds: issue.ruleIds,
      ruleTitle: rule?.title ?? null,
    };
  }

  // No deterministic correct form → do not invent a variant.
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

/**
 * Suggest-only checker: correct words stay silent; incorrect words get a
 * concrete variant when known. Latin→Cyrillic is optional (user opt-in in UI).
 */
export function buildOrthographySuggestions(
  text: string,
  options?: { includeLatinToCyrillic?: boolean },
): OrthographyCheckResult {
  const rawIssues = dedupeHarmonyWhenYiFixable(scanMongolianText(text));
  const orthography = rawIssues
    .map(suggestForIssue)
    .filter((item): item is OrthographySuggestion => item != null);

  const latin: OrthographySuggestion[] = options?.includeLatinToCyrillic
    ? findLatinToCyrillicSuggestions(text).map(latinToSuggestion)
    : [];

  const suggestions = [...orthography, ...latin];
  return {
    suggestions,
    suggestionCount: suggestions.length,
    orthographyCount: orthography.length,
    latinCount: latin.length,
  };
}

function latinToSuggestion(
  item: LatinToCyrillicSuggestion,
): OrthographySuggestion {
  return {
    kind: "LATIN_TO_CYRILLIC",
    sourceWord: item.sourceWord,
    suggestedWord: item.suggestedWord,
    suggestionLabel: item.label,
    ruleIds: [],
    ruleTitle: null,
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

  // Cyrillic issues are normalized lowercase — match case-insensitively.
  const insensitive = new RegExp(
    `(^|[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü'])(${escapeRegExp(sourceWord)})(?=[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü']|$)`,
    "giu",
  );
  return text.replace(insensitive, `$1${suggestedWord}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type { OrthographyIssueCode, LatinToCyrillicSuggestion };
