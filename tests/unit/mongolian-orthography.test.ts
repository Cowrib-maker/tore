import { describe, expect, it } from "vitest";

import {
  ORTHOGRAPHY_RULE_CATALOG,
  checkMongolianWord,
  checkVowelHarmony,
  checkYiSpelling,
  classifyVowel,
  inferWordGender,
  scanMongolianText,
} from "@/domain/mongolian-orthography";
import {
  dictionarySizeForTests,
  isKnownMongolianWord,
  suggestDictionaryWords,
} from "@/domain/mongolian-orthography/dictionary";

describe("mongolian orthography engine", () => {
  it("classifies masculine, feminine, and neutral vowels (§7)", () => {
    expect(classifyVowel("а")).toBe("masculine");
    expect(classifyVowel("ө")).toBe("feminine");
    expect(classifyVowel("и")).toBe("neutral");
    expect(classifyVowel("ю", "у")).toBe("masculine");
    expect(classifyVowel("ю", "ү")).toBe("feminine");
  });

  it("accepts harmonious words from the rule examples (§8)", () => {
    expect(checkVowelHarmony("авдартай")).toBeNull();
    expect(checkVowelHarmony("эрдэм")).toBeNull();
    expect(checkVowelHarmony("онгоцоор")).toBeNull();
    expect(checkVowelHarmony("өргөдөл")).toBeNull();
    expect(checkMongolianWord("бодлого")).toEqual([]);
  });

  it("flags mixed masculine and feminine vowels in one word (§8)", () => {
    const issue = checkVowelHarmony("авдэр");
    expect(issue?.code).toBe("VOWEL_HARMONY");
    expect(issue?.ruleIds).toContain("§8");
  });

  it("skips common exception endings like -гүй and -жээ (§8 гажилт)", () => {
    expect(checkVowelHarmony("горьгүй")).toBeNull();
    expect(checkVowelHarmony("байжээ")).toBeNull();
  });

  it("flags ы in feminine-only stems (§10)", () => {
    expect(checkYiSpelling("хүны")).toMatchObject({ code: "YI_IN_FEMININE" });
    expect(checkYiSpelling("ардын")).toBeNull();
  });

  it("infers word gender for suffix advice (§7)", () => {
    expect(inferWordGender("уул")).toBe("masculine");
    expect(inferWordGender("хүн")).toBe("feminine");
    expect(inferWordGender("жил")).toBe("feminine");
  });

  it("scans running text and catalogs all 64 sections", () => {
    const issues = scanMongolianText("Бодлого авдэр байна.");
    expect(issues.some((item) => item.code === "VOWEL_HARMONY")).toBe(true);
    expect(ORTHOGRAPHY_RULE_CATALOG).toHaveLength(64);
    expect(ORTHOGRAPHY_RULE_CATALOG[0]?.id).toBe("§1");
    expect(ORTHOGRAPHY_RULE_CATALOG[63]?.id).toBe("§64");
  });

  it("recognizes the shipped core dictionary and does not treat Latin tokens as Mongolian words", () => {
    expect(dictionarySizeForTests()).toBeGreaterThan(150);
    expect(isKnownMongolianWord("хууль")).toBe(true);
    expect(isKnownMongolianWord("өмгөөлөгч")).toBe(true);
    expect(isKnownMongolianWord("legal")).toBe(true);
  });

  it("returns deterministic high-confidence corrections for common typos", () => {
    expect(suggestDictionaryWords("хунэтаи", 5, { highConfidenceOnly: true })).toEqual([
      "хүнтэй",
    ]);
    expect(suggestDictionaryWords("өчигдр", 5, { highConfidenceOnly: true })).toEqual([
      "өчигдөр",
    ]);
    expect(suggestDictionaryWords("гэрээсэй", 5, { highConfidenceOnly: true })).toEqual([
      "гэрээсээ",
    ]);
  });

  it("does not invent a correction when high-confidence mode has no verified mapping", () => {
    expect(suggestDictionaryWords("хуульч", 5, { highConfidenceOnly: true })).toEqual([]);
    expect(suggestDictionaryWords("qwerty", 5, { highConfidenceOnly: true })).toEqual([]);
  });
});
