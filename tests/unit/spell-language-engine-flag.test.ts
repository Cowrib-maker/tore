import { afterEach, describe, expect, it } from "vitest";
import { SPELL_LANGUAGE_ENGINE_V1_FLAG, isSpellLanguageEngineV1Enabled } from "@/lib/feature-flags";
import { checkWithLanguageEngineV1 } from "@/application/use-cases/orthography/language-engine-v1-adapter";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography";

const prev = process.env[SPELL_LANGUAGE_ENGINE_V1_FLAG];
afterEach(() => {
  if (prev === undefined) delete process.env[SPELL_LANGUAGE_ENGINE_V1_FLAG];
  else process.env[SPELL_LANGUAGE_ENGINE_V1_FLAG] = prev;
});

describe("TORE_SPELL_LANGUAGE_ENGINE_V1", () => {
  it("is OFF by default and for any value but exactly 1", () => {
    delete process.env[SPELL_LANGUAGE_ENGINE_V1_FLAG];
    expect(isSpellLanguageEngineV1Enabled()).toBe(false);
    for (const v of ["", "0", "true", "yes", "2"]) {
      process.env[SPELL_LANGUAGE_ENGINE_V1_FLAG] = v;
      expect(isSpellLanguageEngineV1Enabled()).toBe(false);
    }
    process.env[SPELL_LANGUAGE_ENGINE_V1_FLAG] = "1";
    expect(isSpellLanguageEngineV1Enabled()).toBe(true);
  });
  it("adapter returns the legacy response shape with only MISSPELLED suggestions", () => {
    const text = "Тэр хунэтаи ирлээ, Тогтох ба НҮБ-ын 2026 захирамж.";
    const r = checkWithLanguageEngineV1(text, {});
    expect(r.suggestionCount).toBe(r.suggestions.length);
    expect(r.suggestions.map((s) => s.sourceWord)).toEqual(["хунэтаи"]);
    const s = r.suggestions[0]!;
    expect(text.slice(s.start, s.end)).toBe("хунэтаи");
    expect(s.suggestedWord).toBe("хүнтэй");
    expect(s.candidates).toEqual(["хүнтэй"]);
  });
  it("keeps Latin→Cyrillic conversion available when requested", () => {
    const legacy = buildOrthographySuggestions("sain baina uu", { includeLatinToCyrillic: true });
    const v1 = checkWithLanguageEngineV1("sain baina uu", { includeLatinToCyrillic: true });
    expect(v1.latinCount).toBe(legacy.suggestions.filter((s) => s.kind === "LATIN_TO_CYRILLIC").length);
    expect(checkWithLanguageEngineV1("sain baina uu", {}).latinCount).toBe(0);
  });
  it("legacy engine is untouched when the flag is off", () => {
    expect(buildOrthographySuggestions("хунэтаи").suggestions[0]?.suggestedWord).toBe("хүнтэй");
  });
});
