import { describe, expect, it } from "vitest";

import {
  isKnownMongolianWord,
  suggestDictionaryWords,
} from "@/domain/mongolian-orthography/dictionary";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";

/**
 * Regression coverage for the dictionary-coverage-and-candidate-generation
 * audit that followed commit 0577f94. Each block documents the concrete
 * evidence that justified the fix — no entry here is a guess.
 */
describe("Mongolian dictionary coverage audit", () => {
  it("regression: ширэх still ranks ширхэг above ирэх (0577f94 baseline)", () => {
    const candidates = suggestDictionaryWords("ширэх");
    expect(candidates[0]).toBe("ширхэг");
    expect(candidates.indexOf("ширхэг")).toBeLessThan(
      candidates.indexOf("ирэх") === -1 ? Infinity : candidates.indexOf("ирэх"),
    );
  });

  it("regression: хаалттай is still not a false positive (0577f94 baseline)", () => {
    expect(isKnownMongolianWord("хаалттай")).toBe(true);
    expect(suggestDictionaryWords("хаалттай")).toEqual([]);
  });

  it("dangerous entry found: mechanically-generated double-consonant non-words are no longer accepted as known", () => {
    // STEM_EXPANSIONS x SHORT_SUFFIXES used to generate "хэрэг"+"г"="хэрэгг"
    // etc. as literal dictionary entries, and matchesMorphology separately
    // accepted them via live suffix-stripping — neither "хэрэгг" nor
    // "баримтт" is a real Mongolian word (no case suffix doubles a stem's
    // final consonant; Mongolian picks a different case allomorph instead).
    for (const bogus of ["хэрэгг", "баримтт", "асуултт", "хариултт", "заалтт", "хэсэгг", "хувцасс"]) {
      expect(isKnownMongolianWord(bogus)).toBe(false);
    }
  });

  it("the geminate guard is narrow enough to keep genuine -тай/-тэй doubling valid", () => {
    // The comitative suffix ("has X") is a different, independent
    // word-forming suffix from the bare case-allomorph letters above, and
    // legitimately doubles a stem's final consonant: "хаалт" (lock) +
    // "тай" = "хаалттай" (locked) is an ordinary word, not a typo. This is
    // the exact case the original 0577f94 false-positive report covered —
    // a fix for the geminate bug must not regress it.
    for (const valid of ["хаалттай", "заалттай", "эрхтэй", "ялтай", "хариуцлагатай"]) {
      expect(isKnownMongolianWord(valid)).toBe(true);
    }
  });

  it("coverage gap found and fixed: хүүхэд (child) and its plural", () => {
    // "хүүхэд" was entirely absent from the dictionary — one of the most
    // basic Mongolian nouns. Its elided-vowel plural "хүүхдүүд" already had
    // the right *mechanism* (matchesElidedStem) but nothing to land on.
    expect(isKnownMongolianWord("хүүхэд")).toBe(true);
    expect(isKnownMongolianWord("хүүхдүүд")).toBe(true);
  });

  it("coverage gap found and fixed: миний (my/mine) was missing and mis-corrected", () => {
    // Before the fix: isKnownMongolianWord("миний") was false and
    // suggestDictionaryWords("миний") returned ["минь", "минут", "манай"]
    // — a real, extremely common possessive pronoun form was being
    // silently mis-flagged for correction.
    expect(isKnownMongolianWord("миний")).toBe(true);
    expect(suggestDictionaryWords("миний")).toEqual([]);
  });

  it("coverage gap found and fixed: common verb tense/converb suffixes on an already-known stem", () => {
    // "явах"/"явсан"/"явж" were hardcoded as separate whole words, but the
    // bare stem "яв" wasn't registered, so any tense not spelled out as
    // one of those exact forms (e.g. явлаа, явна, явтал) came back
    // unknown. Added the closed-class past-perfective (-лаа/-лоо/-лээ/-лөө),
    // non-past (-на/-но/-нэ/-нө), and "until" converb (-тал/-тол/-тэл/-төл)
    // suffixes plus the bare "яв" stem.
    for (const form of ["явлаа", "явна", "явтал"]) {
      expect(isKnownMongolianWord(form)).toBe(true);
    }
  });

  it("coverage gap found and fixed: -ид plural for person-nouns (хуульчид, шүүгчид)", () => {
    // "хуульчид" (lawyers) is the standard plural of "хуульч" and is
    // extremely common in legal text (e.g. "Монголын хуульчдын холбоо").
    // It was previously unknown and "corrected" down to the singular.
    expect(isKnownMongolianWord("хуульчид")).toBe(true);
    expect(isKnownMongolianWord("шүүгчид")).toBe(true);
  });

  it("end-to-end: none of the fixed words are underlined in running text", () => {
    const sample =
      "Миний хүүхэд өчигдөр хуульчидтай уулзаад, тэд хамтдаа явлаа. Тэр өдөр шинэ хаалттай өрөөнд орсон юм.";
    const result = buildOrthographySuggestions(sample);
    const flagged = result.suggestions.map((item) => item.sourceWord);
    for (const shouldNotBeFlagged of ["Миний", "хүүхэд", "явлаа", "хаалттай"]) {
      expect(flagged).not.toContain(shouldNotBeFlagged);
    }
  });

  it("documented limitation: a valid typo can still produce zero candidates when the intended word is entirely absent from the dictionary", () => {
    // "нотариатч" (notary) is not in the dictionary at all, so a typo of
    // it ("нотариач") has nothing to be ranked against. This is the
    // expected, safe behavior of a closed hand-curated dictionary (silence
    // over a wrong guess) — not a ranking bug. Section D's corpus-vocabulary
    // pipeline is the intended fix for *this* class of gap, not more
    // fuzzy-matching tolerance.
    expect(isKnownMongolianWord("нотариатч")).toBe(false);
    expect(suggestDictionaryWords("нотариач")).toEqual([]);
  });

  it("documented limitation: edit distance is capped at 2 and does not reach a 3+ edit typo", () => {
    expect(suggestDictionaryWords("шриэхг")).toEqual([]);
  });
});
