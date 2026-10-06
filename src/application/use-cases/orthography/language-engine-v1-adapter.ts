import {
  buildOrthographySuggestions,
  type OrthographyCheckResult,
  type OrthographySuggestion,
} from "@/domain/mongolian-orthography";
import { createSpellEngineV1, type SpellEngineV1 } from "@/spell-engine";

let engine: SpellEngineV1 | null = null;

/** One engine per server process (lexicon + morphology caches are reusable). */
function getEngine(): SpellEngineV1 {
  engine ??= createSpellEngineV1();
  return engine;
}

/**
 * Run the Language Engine V1 and present its result in the response shape
 * the existing /api/orthography/check clients already understand. Only
 * MISSPELLED tokens become suggestions; UNKNOWN never does. Latin→Cyrillic
 * conversion (a separate, opt-in feature) is still served by the legacy
 * module so that behaviour is unchanged.
 */
export function checkWithLanguageEngineV1(
  text: string,
  options: { includeLatinToCyrillic?: boolean },
): OrthographyCheckResult {
  const result = getEngine().analyze(text);
  const suggestions: OrthographySuggestion[] = [];
  for (const issue of result.issues) {
    if (issue.verdict !== "MISSPELLED" || issue.suggestions.length === 0) continue;
    suggestions.push({
      kind: issue.reasonCode === "TYPO_PAIR" || issue.reasonCode === "EDIT_DISTANCE_UNIQUE" ? "SPELLING" : "ORTHOGRAPHY",
      sourceWord: issue.token,
      suggestedWord: issue.suggestions[0]!.text,
      suggestionLabel: issue.message,
      ruleIds: [issue.reasonCode],
      ruleTitle: null,
      start: issue.range.start,
      end: issue.range.end,
      candidates: issue.suggestions.map((s) => s.text),
    });
  }
  let latinCount = 0;
  if (options.includeLatinToCyrillic) {
    const legacy = buildOrthographySuggestions(text, { includeLatinToCyrillic: true });
    for (const s of legacy.suggestions) {
      if (s.kind !== "LATIN_TO_CYRILLIC") continue;
      if (suggestions.some((x) => x.start < s.end && s.start < x.end)) continue;
      suggestions.push(s);
      latinCount += 1;
    }
  }
  suggestions.sort((a, b) => a.start - b.start);
  const orthographyCount = suggestions.filter((s) => s.kind === "ORTHOGRAPHY").length;
  const spellingCount = suggestions.filter((s) => s.kind === "SPELLING").length;
  return {
    suggestions,
    suggestionCount: suggestions.length,
    orthographyCount,
    latinCount,
    spellingCount,
    wordCount: result.stats.wordCount,
    characterCount: result.stats.characterCount,
  };
}
