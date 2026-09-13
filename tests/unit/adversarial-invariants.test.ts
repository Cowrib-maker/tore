import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearGeneratedVocabularyForTests,
  completeWordsForTests,
  generatedVocabularyProvenance,
  isKnownMongolianWord,
  registerGeneratedVocabulary,
  scoreCandidate,
  suggestDictionaryWords,
  type RegisterableVocabularyEntry,
} from "@/domain/mongolian-orthography/dictionary";
import { extractVocabularyCandidates, selectSafeDictionaryEntries } from "@/domain/mongolian-orthography/corpus-vocabulary";
import { levenshteinDistance } from "@/domain/mongolian-orthography/levenshtein";
import { DANGEROUS_NEAR_NEIGHBORS } from "../evaluation/adversarial-gold-set";

/**
 * Milestone 7 (adversarial orthography evaluation), Section 5: the 6
 * named ranking invariants, each turned into an executable regression
 * test. Every test either reuses evidence already gathered this milestone
 * (the DANGEROUS_NEAR_NEIGHBORS pairs, the completeWordsForTests() scan)
 * or constructs a minimal, deterministic case that isolates exactly the
 * property being asserted.
 */

describe("Invariant 1: a valid dictionary word must never be automatically corrected", () => {
  it("every DANGEROUS_NEAR_NEIGHBORS pair member is silent (already known words never reach ranking at all)", () => {
    for (const { wordA, wordB } of DANGEROUS_NEAR_NEIGHBORS) {
      expect(isKnownMongolianWord(wordA)).toBe(true);
      expect(isKnownMongolianWord(wordB)).toBe(true);
      expect(suggestDictionaryWords(wordA)).toEqual([]);
      expect(suggestDictionaryWords(wordB)).toEqual([]);
    }
  });

  it("scanning the REAL shipped dictionary for edit-distance-1 pairs: no known word ever produces a suggestion for itself or its neighbor", () => {
    // Systematic, not anecdotal: exercises every complete word in the
    // live dictionary, not just the hand-picked pairs above.
    const words = completeWordsForTests();
    let checked = 0;
    for (const word of words) {
      expect(suggestDictionaryWords(word)).toEqual([]);
      checked += 1;
    }
    expect(checked).toBe(words.length);
    expect(checked).toBeGreaterThan(0);
  });
});

describe("Invariant 2: a candidate with no meaningful prefix/stem relationship must not outrank a candidate with strong structural similarity, purely on raw edit distance", () => {
  it("a zero-prefix-overlap, no-shared-stem candidate scores far below a same-root candidate needing more edits (ширэх case)", () => {
    const input = "ширэх";
    const structurallyUnrelatedButCloser = "ирэх"; // distance 1, zero prefix overlap
    const structurallyRelatedButFarther = "ширхэг"; // distance 2, shared root
    expect(levenshteinDistance(input, structurallyUnrelatedButCloser)).toBeLessThan(
      levenshteinDistance(input, structurallyRelatedButFarther),
    );
    expect(scoreCandidate(input, structurallyRelatedButFarther)).toBeGreaterThan(
      scoreCandidate(input, structurallyUnrelatedButCloser),
    );
  });

  it("suggestDictionaryWords itself, not just scoreCandidate in isolation, ranks the structurally-related candidate first and never surfaces the sub-threshold structurally-unrelated one", () => {
    const candidates = suggestDictionaryWords("ширэх");
    expect(candidates[0]).toBe("ширхэг");
    // "ирэх" scores 0.093 (see the ranking-stress suite) — well under
    // MIN_SUGGESTION_CONFIDENCE (0.4) — so it must never appear at any
    // position in the returned list, not just be outranked.
    expect(candidates).not.toContain("ирэх");
  });
});

describe("Invariant 3: proper nouns and abbreviations must never automatically enter trusted correction vocabulary", () => {
  it("PROPER_NOUN and ABBREVIATION candidates are always capped at ATTESTED, never REVIEW or TRUSTED, however frequent", () => {
    const documents = Array.from({ length: 30 }, (_, i) => ({
      id: `d${i}`,
      text: "Тэр Сүхбаатар дүүрэгт амьдардаг. НҮБ-аас мэдэгдэл гаргав.",
    }));
    const result = extractVocabularyCandidates(documents);
    const properOrAbbrev = result.candidates.filter(
      (c) => c.category === "PROPER_NOUN" || c.category === "ABBREVIATION",
    );
    expect(properOrAbbrev.length).toBeGreaterThan(0);
    for (const candidate of properOrAbbrev) {
      expect(candidate.trustLevel).toBe("ATTESTED");
    }
  });

  it("selectSafeDictionaryEntries-eligible TRUSTED entries never include a PROPER_NOUN or ABBREVIATION category", () => {
    const documents = Array.from({ length: 30 }, (_, i) => ({
      id: `d${i}`,
      text: "Тэр Сүхбаатар дүүрэгт амьдардаг. НҮБ-аас мэдэгдэл гаргав.",
    }));
    const result = extractVocabularyCandidates(documents);
    const safe = selectSafeDictionaryEntries(result);
    for (const entry of safe) {
      expect(entry.category).not.toBe("PROPER_NOUN");
      expect(entry.category).not.toBe("ABBREVIATION");
    }
  });
});

describe("Invariant 4: generated vocabulary must never override hand-curated vocabulary", () => {
  afterEach(() => {
    clearGeneratedVocabularyForTests();
  });

  it("registering a generated entry that collides with a hand-curated word does not change its known-status, and cleanup never erases it", () => {
    // "эрх" is hand-curated (see VALID_LEGAL_TERMS). Registering it AGAIN
    // via the generated path must be a safe no-op from the caller's
    // perspective: still known before, during, and after cleanup — proving
    // it was correctly recognized as pre-existing (HAND_CURATED_WORDS),
    // not treated as freshly-generated data that clearGeneratedVocabularyForTests
    // would be free to delete.
    expect(isKnownMongolianWord("эрх")).toBe(true);
    registerGeneratedVocabulary([
      { word: "эрх", category: "LEGAL", occurrenceCount: 999, documentFrequency: 999 },
    ]);
    expect(isKnownMongolianWord("эрх")).toBe(true);
    expect(generatedVocabularyProvenance("эрх")).not.toBeNull();

    clearGeneratedVocabularyForTests();
    // Cleanup must never remove genuinely hand-curated data.
    expect(isKnownMongolianWord("эрх")).toBe(true);
  });

  it("clearGeneratedVocabularyForTests never deletes a hand-curated word even after a colliding registration", () => {
    registerGeneratedVocabulary([
      { word: "хэрэг", category: "COMMON", occurrenceCount: 1, documentFrequency: 1 },
    ]);
    clearGeneratedVocabularyForTests();
    expect(isKnownMongolianWord("хэрэг")).toBe(true);
  });
});

describe("Invariant 5: low-confidence candidates must produce no suggestion", () => {
  it("EVERY candidate suggestDictionaryWords returns clears MIN_SUGGESTION_CONFIDENCE individually, not just the top one (regression: milestone-7 finding + fix)", () => {
    // Adversarial finding from this milestone: rankFuzzyCandidates() used
    // to gate only the TOP-ranked candidate against MIN_SUGGESTION_CONFIDENCE
    // and then return up to `limit` (3) candidates regardless of the 2nd/3rd
    // ones' own scores. Concretely, suggestDictionaryWords("мэрэг") used to
    // return ['мэдэх' (0.466), 'хэрэг' (0.098), 'гэрээ' (0.080)] — two
    // candidates far below the confidence floor, shown to real users in the
    // spellcheck popup (src/components/orthography/spellcheck-textarea.tsx
    // reads `candidates` directly). Fixed in dictionary.ts's
    // rankFuzzyCandidates() by filtering the whole ranked list to the
    // confidence floor before slicing to `limit`, not just checking the
    // top entry.
    const lowConfidenceInput = "мэрэг";
    expect(isKnownMongolianWord(lowConfidenceInput)).toBe(false);
    const candidates = suggestDictionaryWords(lowConfidenceInput);
    expect(candidates).toEqual(["мэдэх"]);
    for (const candidate of candidates) {
      expect(scoreCandidate(lowConfidenceInput, candidate)).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("захирамж/яллагдагч/сэжигтэн (confirmed absent from the dictionary) never produce a sub-threshold guessed suggestion", () => {
    for (const word of ["захирамж", "яллагдагч", "сэжигтэн"]) {
      const candidates = suggestDictionaryWords(word);
      for (const candidate of candidates) {
        expect(scoreCandidate(word, candidate)).toBeGreaterThanOrEqual(0.4);
      }
    }
  });
});

describe("Invariant 6: a candidate produced only through an unsafe single-letter suffix boundary must be rejected", () => {
  it("гэ (from гэж/гэх/гэм via single-letter suffixes) is never derived as a MORPHOLOGICAL_STEM candidate", () => {
    const documents = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      text: "Тэр гэж хэлсэн. Ингэж гэх нь мэдээж. Энэ бол гэм биш.",
    }));
    const result = extractVocabularyCandidates(documents);
    expect(result.candidates.find((c) => c.word === "гэ")).toBeUndefined();
  });

  it("гэ is not present in the shipped generated/legal-vocabulary.json artifact", () => {
    const generated = JSON.parse(
      readFileSync(join(process.cwd(), "generated/legal-vocabulary.json"), "utf8"),
    ) as { entries: readonly { word: string }[] };
    expect(generated.entries.some((e) => e.word === "гэ")).toBe(false);
  });

  it("хэрэгг (хэрэг + coincidental single-letter г, which would geminate) is never a known word", () => {
    expect(isKnownMongolianWord("хэрэгг")).toBe(false);
  });

  it("the geminate guard is correctly scoped to single-letter suffixes only: хаалттай (a genuine multi-letter-suffix double) stays known", () => {
    expect(isKnownMongolianWord("хаалттай")).toBe(true);
  });
});
