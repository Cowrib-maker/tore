import { describe, expect, it } from "vitest";

import {
  isKnownMongolianWord,
  suggestDictionaryWords,
} from "@/domain/mongolian-orthography/dictionary";
import {
  buildOrthographySuggestions,
  replaceAtSpan,
} from "@/domain/mongolian-orthography/suggestions";

describe("Mongolian spellcheck candidate ranking", () => {
  it("ranks the same-root candidate (ширхэг) above the structurally unrelated one (ирэх) for ширэх", () => {
    const candidates = suggestDictionaryWords("ширэх");
    expect(candidates[0]).toBe("ширхэг");
    const irekhIndex = candidates.indexOf("ирэх");
    const shirkhegIndex = candidates.indexOf("ширхэг");
    if (irekhIndex !== -1) {
      expect(shirkhegIndex).toBeLessThan(irekhIndex);
    }
  });

  it("does not flag the correctly spelled ширхэг just because ирэх is dictionary-close", () => {
    expect(isKnownMongolianWord("ширхэг")).toBe(true);
    expect(suggestDictionaryWords("ширхэг")).toEqual([]);
    const result = buildOrthographySuggestions("5 ширхэг баримт хавсаргав.");
    expect(result.suggestions.some((item) => item.sourceWord === "ширхэг")).toBe(false);
  });

  it("does not flag хаалттай as a spelling error just because заалттай is a close dictionary word", () => {
    expect(isKnownMongolianWord("хаалттай")).toBe(true);
    expect(suggestDictionaryWords("хаалттай")).toEqual([]);
    const result = buildOrthographySuggestions("Өрөө хаалттай байсан.");
    expect(result.suggestionCount).toBe(0);
    expect(result.suggestions.some((item) => item.sourceWord === "хаалттай")).toBe(false);
  });

  it("does not invent a correction for a word with no confident dictionary match", () => {
    expect(isKnownMongolianWord("жиппоюкс")).toBe(false);
    expect(suggestDictionaryWords("жиппоюкс")).toEqual([]);
    const result = buildOrthographySuggestions("Энэ бол жиппоюкс гэсэн үг.");
    expect(result.suggestions.some((item) => item.sourceWord === "жиппоюкс")).toBe(false);
  });

  it("keeps multiple misspellings in one text independent — spans don't overlap and each keeps its own ranked candidates", () => {
    const text = "Тэр ширэх мaтериалыг хунэтаи хүнд өгсөн.";
    const result = buildOrthographySuggestions(text);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1);

    const spans = result.suggestions.map((item) => [item.start, item.end] as const);
    const sorted = [...spans].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]![0]).toBeGreaterThanOrEqual(sorted[i - 1]![1]!);
    }

    const shirekh = result.suggestions.find((item) => item.sourceWord === "ширэх");
    expect(shirekh?.suggestedWord).toBe("ширхэг");

    // Replacing one flagged span must not touch the rest of the text.
    if (shirekh) {
      const replaced = replaceAtSpan(text, shirekh.start, shirekh.end, shirekh.suggestedWord);
      expect(replaced).not.toBe(text);
      expect(replaced.slice(shirekh.start, shirekh.start + shirekh.suggestedWord.length)).toBe(
        shirekh.suggestedWord,
      );
      expect(replaced.slice(shirekh.start + shirekh.suggestedWord.length)).toBe(
        text.slice(shirekh.end),
      );
      expect(replaced.slice(0, shirekh.start)).toBe(text.slice(0, shirekh.start));
    }
  });

  it("still returns the highest-confidence common-typo correction first (regression: existing map unaffected by ranking rewrite)", () => {
    expect(suggestDictionaryWords("хунэтаи")[0]).toBe("хүнтэй");
    expect(suggestDictionaryWords("өчигдр")[0]).toBe("өчигдөр");
  });
});
