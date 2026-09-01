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

  it("stays silent for criminal law statute paste (no fuzzy false positives)", () => {
    const sample =
      "Шүүх гэмт хэрэг үйлдсэн нь тогтоогдсон, гэм буруугаа хүлээн зөвшөөрсөн өсвөр насны хүний гэмт хэрэг үйлдсэн нөхцөл байдал, учруулсан хохирол, хор уршгийн шинж чанар, хувийн байдал, мөрдөн шалгах ажиллагааг шуурхай явуулж гэмт хэргийг нотлоход дэмжлэг үзүүлсэн байдлыг харгалзан дараах байдлаар эрүүгийн хариуцлагыг хөнгөрүүлж, эсхүл эрүүгийн хариуцлагаас чөлөөлж болно.";
    const result = buildOrthographySuggestions(sample);
    expect(result.spellingCount).toBe(0);
    expect(isKnownMongolianWord("нөхөн")).toBe(true);
    expect(isKnownMongolianWord("эсхүл")).toBe(true);
    expect(isKnownMongolianWord("хэсэг")).toBe(true);
    expect(isKnownMongolianWord("заалтад")).toBe(true);
    expect(suggestDictionaryWords("нөхөн")).toEqual([]);
  });
});
