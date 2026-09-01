import { describe, expect, it } from "vitest";

import {
  buildOrthographySuggestions,
  isKnownMongolianWord,
  suggestDictionaryWords,
} from "@/domain/mongolian-orthography";

describe("mongolian dictionary spell-check", () => {
  it("recognizes common words from spellcheck demo paragraph", () => {
    expect(isKnownMongolianWord("өчигдөр")).toBe(true);
    expect(isKnownMongolianWord("хүнтэй")).toBe(true);
    expect(isKnownMongolianWord("гэрээсээ")).toBe(true);
  });

  it("suggests fixes for common typos", () => {
    expect(suggestDictionaryWords("хунэтаи")[0]).toBe("хүнтэй");
    expect(suggestDictionaryWords("гэрээсэй")[0]).toBe("гэрээсээ");
    expect(suggestDictionaryWords("өчигдр")[0]).toBe("өчигдөр");
  });

  it("returns spans for highlighted spellcheck UI", () => {
    const sample =
      "Өчигдөр манай гэрт хунэтаи анх удаа танилцаж байна.";
    const result = buildOrthographySuggestions(sample);
    expect(result.spellingCount).toBeGreaterThan(0);
    expect(result.suggestions[0]?.start).toBeGreaterThanOrEqual(0);
    expect(result.suggestions[0]?.end).toBeGreaterThan(
      result.suggestions[0]?.start ?? 0,
    );
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.characterCount).toBe(sample.length);
  });
});
