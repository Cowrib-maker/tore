import type {
  CheckRequest,
  CheckResult,
  IssueCategory,
  LanguageEngine,
  LanguageIssue,
} from "@/spell-engine";
import {
  buildOrthographySuggestions,
  type OrthographySuggestion,
} from "@/domain/mongolian-orthography";

/**
 * Engine v0: the EXISTING TORE orthography engine (vowel-harmony / suffix
 * rules + curated dictionary) behind the Spell `LanguageEngine` contract.
 *
 * It is a baseline, not a finished product: word-level only, no morphology,
 * no sentence context, no grammar. Its `capabilities` say so, and its version
 * must be bumped whenever its rules or dictionary change so measurements stay
 * comparable. Nothing here alters the existing engine or its endpoint.
 *
 * Deliberately excluded: the flag-gated generated legal vocabulary
 * (TORE_GENERATED_LEGAL_VOCABULARY_V1). v0 measures the curated dictionary only.
 */
const CATEGORY: Record<OrthographySuggestion["kind"], IssueCategory> = {
  ORTHOGRAPHY: "ORTHOGRAPHY",
  SPELLING: "SPELLING",
  LATIN_TO_CYRILLIC: "SCRIPT_CONVERSION",
};

export const ORTHOGRAPHY_V0_ENGINE_ID = "orthography-rules";
export const ORTHOGRAPHY_V0_ENGINE_VERSION = "0.1.0";

export class OrthographyV0Engine implements LanguageEngine {
  readonly info = {
    id: ORTHOGRAPHY_V0_ENGINE_ID,
    version: ORTHOGRAPHY_V0_ENGINE_VERSION,
    capabilities: ["SPELLING", "ORTHOGRAPHY", "SCRIPT_CONVERSION"] as const,
    maturity: "BASELINE_RULES" as const,
  };

  async check(request: CheckRequest): Promise<CheckResult> {
    const text = request.text;
    const raw = buildOrthographySuggestions(text, {
      includeLatinToCyrillic: request.options?.convertLatinToCyrillic ?? false,
    });

    const issues: LanguageIssue[] = raw.suggestions
      .filter((s) => s.start >= 0 && s.end <= text.length && s.start < s.end)
      .map((s) => {
        const texts = s.candidates?.length ? s.candidates : [s.suggestedWord];
        return {
          id: `${s.start}:${s.end}:${s.ruleIds[0] ?? s.kind}`,
          category: CATEGORY[s.kind],
          span: { start: s.start, end: s.end },
          original: text.slice(s.start, s.end),
          message: s.suggestionLabel,
          ruleIds: s.ruleIds,
          suggestions: texts
            .filter((t) => t.length > 0)
            .map((t, i) => ({ text: t, rank: i + 1 })),
        };
      })
      .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);

    // Disambiguate ids if two issues share span and rule.
    const seen = new Map<string, number>();
    const unique = issues.map((issue) => {
      const n = (seen.get(issue.id) ?? 0) + 1;
      seen.set(issue.id, n);
      return n === 1 ? issue : { ...issue, id: `${issue.id}#${n}` };
    });

    return {
      engine: { id: this.info.id, version: this.info.version },
      issues: unique,
      stats: {
        characterCount: raw.characterCount,
        wordCount: raw.wordCount,
      },
    };
  }
}
