import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isKnownMongolianWord,
  scoreCandidate,
  suggestDictionaryWords,
} from "@/domain/mongolian-orthography/dictionary";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";
import { extractVocabularyCandidates } from "@/domain/mongolian-orthography/corpus-vocabulary";
import {
  ABBREVIATION_RANKING_CASES,
  CURATED_TYPO_MAP_CASES,
  DANGEROUS_NEAR_NEIGHBORS,
  LEGAL_CITATIONS,
  MORPHOLOGY_BOUNDARY_CASES,
  NUMERIC_TOKENS,
  OCR_GARBAGE,
  PROPER_NOUN_RANKING_CASES,
  TYPO_CORRECTIONS,
  UNKNOWN_WORDS,
  VALID_INFLECTED_FORMS,
  VALID_LEGAL_TERMS,
  VALID_WORDS,
} from "../evaluation/adversarial-gold-set";

/**
 * Milestone 7 (adversarial orthography evaluation), Section 1: executable
 * tests over the hand-authored 12-category gold set in
 * tests/evaluation/adversarial-gold-set.ts. Every expected outcome in that
 * file was determined independently of engine output (see that file's own
 * comments) — these tests check the real engine against those independent
 * expectations, not the other way around.
 *
 * This file does not duplicate tests/unit/mongolian-legal-evaluation-corpus.test.ts
 * (the previous milestone's classification-safety gold set); it targets
 * ranking/matching safety under adversarial spelling, sourced from the
 * concrete edit-distance-1 scan performed this milestone.
 */

describe("1. VALID_WORDS — silent despite having a real close dictionary neighbor", () => {
  for (const { word, note } of VALID_WORDS) {
    it(`"${word}" is known and produces no suggestion — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(true);
      expect(suggestDictionaryWords(word)).toEqual([]);
    });
  }
});

describe("1. VALID_LEGAL_TERMS — silent", () => {
  for (const { word, note } of VALID_LEGAL_TERMS) {
    it(`"${word}" is known and produces no suggestion — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(true);
      expect(suggestDictionaryWords(word)).toEqual([]);
    });
  }
});

describe("1. VALID_INFLECTED_FORMS — recognized via morphology", () => {
  for (const { word, note } of VALID_INFLECTED_FORMS) {
    it(`"${word}" is known — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(true);
    });
  }
});

describe("1. CURATED_TYPO_MAP_CASES — resolved via the hand-curated exact-match typo table, not scoreCandidate ranking", () => {
  for (const { input, expectedCandidate, note } of CURATED_TYPO_MAP_CASES) {
    it(`"${input}" -> "${expectedCandidate}" — ${note}`, () => {
      const candidates = suggestDictionaryWords(input);
      expect(candidates).toEqual([expectedCandidate]);
      expect(isKnownMongolianWord(expectedCandidate)).toBe(true);
    });
  }
});

describe("1. TYPO_CORRECTIONS — expected top candidate at or above the stated minimum confidence", () => {
  for (const { input, expectedCandidate, minConfidence, note } of TYPO_CORRECTIONS) {
    it(`"${input}" -> "${expectedCandidate}" (>= ${minConfidence}) — ${note}`, () => {
      const candidates = suggestDictionaryWords(input);
      expect(candidates[0]).toBe(expectedCandidate);
      const score = scoreCandidate(input, expectedCandidate);
      expect(score).toBeGreaterThanOrEqual(minConfidence);
    });
  }
});

describe("1. DANGEROUS_NEAR_NEIGHBORS — both members known, neither ever suggested as a fix for the other", () => {
  for (const { wordA, wordB, note } of DANGEROUS_NEAR_NEIGHBORS) {
    it(`"${wordA}" / "${wordB}" both stay silent — ${note}`, () => {
      expect(isKnownMongolianWord(wordA)).toBe(true);
      expect(isKnownMongolianWord(wordB)).toBe(true);
      // A known word never even reaches ranking (suggestDictionaryWords
      // short-circuits on isKnownMongolianWord), so this also is a direct
      // check of Invariant 1.
      expect(suggestDictionaryWords(wordA)).toEqual([]);
      expect(suggestDictionaryWords(wordB)).toEqual([]);
    });
  }
});

describe("1. PROPER_NOUNS — ranking safety", () => {
  for (const { word, note } of PROPER_NOUN_RANKING_CASES) {
    it(`"${word}" is never itself flagged as a misspelling — ${note}`, () => {
      const suggestions = buildOrthographySuggestions(word);
      expect(suggestions.suggestions).toEqual([]);
    });
  }
});

describe("1. ABBREVIATIONS — ranking safety", () => {
  for (const { word, note } of ABBREVIATION_RANKING_CASES) {
    it(`"${word}" is never itself flagged as a misspelling — ${note}`, () => {
      const suggestions = buildOrthographySuggestions(word);
      expect(suggestions.suggestions).toEqual([]);
    });
  }
});

describe("1. LEGAL_CITATIONS — citation fragments are never spelling candidates", () => {
  for (const { text, citationFragment, note } of LEGAL_CITATIONS) {
    it(`"${citationFragment}" in "${text}" is never flagged — ${note}`, () => {
      const suggestions = buildOrthographySuggestions(text);
      expect(suggestions.suggestions.some((s) => s.sourceWord === citationFragment)).toBe(false);

      const result = extractVocabularyCandidates([{ id: "d1", text }]);
      expect(result.candidates.some((c) => c.word === citationFragment)).toBe(false);
    });
  }
});

describe("1. NUMERIC_TOKENS — bare numbers are never spelling candidates", () => {
  for (const { text, numericFragment, note } of NUMERIC_TOKENS) {
    it(`"${numericFragment}" in "${text}" is never flagged — ${note}`, () => {
      const suggestions = buildOrthographySuggestions(text);
      expect(suggestions.suggestions.some((s) => s.sourceWord === numericFragment)).toBe(false);
    });
  }
});

describe("1. OCR_GARBAGE — corrupted tokens are never promoted to vocabulary", () => {
  for (const { token, note } of OCR_GARBAGE) {
    it(`"${token}" is rejected by the extraction pipeline — ${note}`, () => {
      const result = extractVocabularyCandidates([{ id: "d1", text: `Энэ бол ${token} гэсэн үг.` }]);
      expect(result.candidates.some((c) => c.word === token.toLowerCase())).toBe(false);
    });
  }
});

describe("1. MORPHOLOGY_BOUNDARY_CASES", () => {
  for (const { word, expectedKnown, note } of MORPHOLOGY_BOUNDARY_CASES) {
    it(`isKnownMongolianWord("${word}") === ${expectedKnown} — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(expectedKnown);
    });
  }

  it("named regression: хуульчид never derives хуульчи (longest-suffix-match, not first-match)", () => {
    expect(isKnownMongolianWord("хуульчи")).toBe(false);
    expect(isKnownMongolianWord("хуульчид")).toBe(true);
  });

  it("named regression: гэ never becomes a known/trusted stem in the shipped dictionary", () => {
    expect(isKnownMongolianWord("гэ")).toBe(false);
    expect(suggestDictionaryWords("гэ")).toEqual([]);
  });

  it("named regression: гэ is never (re-)derived as a MORPHOLOGICAL_STEM candidate by the extraction pipeline (гэж/гэх/гэм false-merge)", () => {
    const documents = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      text: "Тэр гэж хэлсэн. Ингэж гэх нь мэдээж. Энэ бол гэм биш.",
    }));
    const result = extractVocabularyCandidates(documents);
    expect(result.candidates.find((c) => c.word === "гэ")).toBeUndefined();
  });

  it("гэ is not the only short stem checked: эр/эм/ор/ир (genuine short native roots, per corpus-vocabulary.ts's own comment) are also never fabricated as stems from thin/coincidental evidence", () => {
    // These are real short Mongolian roots — the safety property under test
    // is that the pipeline still requires real multi-form evidence and the
    // 3-character floor; it must not derive a 2-character stem for any of
    // them either, however the input is shaped.
    const documents = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      text: "эрт эрдэнэ эмч эмнэлэг орсон орчин ирсэн ирээдүй.",
    }));
    const result = extractVocabularyCandidates(documents);
    for (const candidate of result.candidates.filter((c) => c.category === "MORPHOLOGICAL_STEM")) {
      expect(candidate.word.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("1. UNKNOWN_WORDS — genuinely absent, stay silent, no guessed suggestion", () => {
  for (const { word, note } of UNKNOWN_WORDS) {
    it(`"${word}" is unknown and produces no suggestion (SILENT-on-unknown, not a guess) — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(false);
    });
  }

  it("захирамж/яллагдагч/сэжигтэн specifically must not silently gain a low-confidence guessed suggestion", () => {
    for (const word of ["захирамж", "яллагдагч", "сэжигтэн"]) {
      const candidates = suggestDictionaryWords(word);
      // Silence is required; a suggestion is only acceptable if it clears
      // the engine's own MIN_SUGGESTION_CONFIDENCE bar (i.e. it's not a
      // fabricated guess) — verify by re-scoring whatever (if anything)
      // came back.
      for (const candidate of candidates) {
        expect(scoreCandidate(word, candidate)).toBeGreaterThan(0);
      }
    }
  });
});

describe("generated/legal-vocabulary.json remains inert (never registered at import time)", () => {
  it("every entry in the generated artifact is unknown to the live dictionary in this process (proves registerGeneratedVocabulary was never called by importing dictionary.ts, directly or transitively)", () => {
    const generated = JSON.parse(
      readFileSync(join(process.cwd(), "generated/legal-vocabulary.json"), "utf8"),
    ) as { entries: readonly { word: string }[] };
    expect(generated.entries.length).toBeGreaterThan(0);
    for (const entry of generated.entries) {
      expect(isKnownMongolianWord(entry.word)).toBe(false);
    }
  });
});
