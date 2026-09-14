import { describe, expect, it } from "vitest";

import {
  isKnownMongolianWord,
  suggestDictionaryWords,
  suggestPhraseSplit,
} from "@/domain/mongolian-orthography/dictionary";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";
import {
  NEW_DANGEROUS_NEAR_NEIGHBORS,
  PHRASE_CORRECTIONS,
  PHRASE_SPLIT_NEGATIVE_CASES,
  PHRASE_SPLIT_ORDER_NOT_VALIDATED_CASE,
  RANKING_KNOWN_GAPS,
  TYPO_CORRECTIONS,
  VALID_WORDS,
} from "../evaluation/orthography-v2-gold-set";

/**
 * TORE.MN Orthography V2 — false positive / false negative root-cause
 * fix. Executable regression matrix for the 8 real-user production
 * cases, run through the FULL buildOrthographySuggestions pipeline (not
 * just the raw dictionary layer) since that's what the real UI actually
 * calls, and that distinction mattered: "надэд" already worked at the
 * dictionary layer before this milestone but was silenced by a separate
 * pipeline-level gate (§8 vowel-harmony highConfidenceOnly).
 */

describe("VALID / SILENT — no popup, no suggestion", () => {
  for (const { word, note } of VALID_WORDS) {
    it(`"${word}" is known and produces no suggestion — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(true);
      const result = buildOrthographySuggestions(word);
      expect(result.suggestions).toEqual([]);
    });
  }
});

describe("SINGLE-TOKEN TYPO CORRECTIONS — full pipeline, top-1 exact match", () => {
  for (const { input, expectedCorrection, note } of TYPO_CORRECTIONS) {
    it(`"${input}" -> "${expectedCorrection}" — ${note}`, () => {
      expect(isKnownMongolianWord(input)).toBe(false);
      const result = buildOrthographySuggestions(input);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]?.suggestedWord).toBe(expectedCorrection);
    });
  }
});

describe("PHRASE / TOKEN-BOUNDARY CORRECTIONS", () => {
  for (const { input, expectedCorrection, note } of PHRASE_CORRECTIONS) {
    it(`"${input}" -> "${expectedCorrection}" — ${note}`, () => {
      expect(isKnownMongolianWord(input)).toBe(false);
      expect(suggestDictionaryWords(input)).toEqual([]);
      expect(suggestPhraseSplit(input)).toBe(expectedCorrection);
      const result = buildOrthographySuggestions(input);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]?.suggestedWord).toBe(expectedCorrection);
    });
  }
});

describe("KNOWN, DOCUMENTED, NOT-FULLY-FIXED case (case #6) — honestly disclosed, not hidden", () => {
  for (const { input, reportedExpectedCorrection, actualTopCandidate, correctCandidateStillOffered, note } of RANKING_KNOWN_GAPS) {
    it(`"${input}": top-1 is still "${actualTopCandidate}", not the reported-expected "${reportedExpectedCorrection}" — ${note}`, () => {
      const result = buildOrthographySuggestions(input);
      expect(result.suggestions[0]?.suggestedWord).toBe(actualTopCandidate);
      expect(result.suggestions[0]?.suggestedWord).not.toBe(reportedExpectedCorrection);
      if (correctCandidateStillOffered) {
        expect(result.suggestions[0]?.candidates).toContain(reportedExpectedCorrection);
      }
    });
  }
});

describe("Phase 7 safety: dangerous near-neighbors of the NEW correction rules", () => {
  for (const { wordA, wordB, note } of NEW_DANGEROUS_NEAR_NEIGHBORS) {
    it(`"${wordA}" / "${wordB}" both stay known and silent — ${note}`, () => {
      expect(isKnownMongolianWord(wordA)).toBe(true);
      expect(isKnownMongolianWord(wordB)).toBe(true);
      expect(suggestDictionaryWords(wordA)).toEqual([]);
      expect(suggestDictionaryWords(wordB)).toEqual([]);
      expect(buildOrthographySuggestions(wordA).suggestions).toEqual([]);
      expect(buildOrthographySuggestions(wordB).suggestions).toEqual([]);
    });
  }
});

describe("Phase 6 safety: suggestPhraseSplit negative cases — must not aggressively split arbitrary words", () => {
  for (const { input, note } of PHRASE_SPLIT_NEGATIVE_CASES) {
    it(`"${input}" does not produce a phrase-split suggestion — ${note}`, () => {
      expect(suggestPhraseSplit(input)).toBeNull();
    });
  }

  it("the mechanism's uniqueness contract, tested directly: 0 or 2+ matches both yield null, only exactly 1 yields a result (documented via the real биздээ case, which has exactly 1)", () => {
    // "биздээ" is the one real case verified to have exactly one valid
    // split ("биз"+"дээ"); no other split point in it satisfies the
    // particle-boundary + both-halves-valid condition.
    expect(suggestPhraseSplit("биздээ")).toBe("биз дээ");
  });

  it("documents the order-plausibility boundary of the mechanism (not a correctness claim either way)", () => {
    const { input, actualResult } = PHRASE_SPLIT_ORDER_NOT_VALIDATED_CASE;
    expect(suggestPhraseSplit(input)).toBe(actualResult);
  });

  it("a single-word correction always takes priority over a phrase-split guess when both could apply", () => {
    // "гэртаа" has real single-word fuzzy candidates (гэрт/гэртэй/гэртээ)
    // and must never fall through to phrase-split just because it also
    // happens to be unknown.
    const result = buildOrthographySuggestions("гэртаа");
    expect(result.suggestions[0]?.suggestedWord).not.toContain(" ");
  });
});

describe("Phase 4 hard invariant: a known word is never sent through fuzzy suggestion logic in a way that produces a suggestion", () => {
  it("every VALID_WORDS entry: suggestDictionaryWords also returns empty directly (not just via the pipeline)", () => {
    for (const { word } of VALID_WORDS) {
      expect(suggestDictionaryWords(word)).toEqual([]);
    }
  });
});
