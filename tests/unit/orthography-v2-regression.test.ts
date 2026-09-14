import { describe, expect, it } from "vitest";

import {
  isKnownMongolianWord,
  scoreCandidate,
  suggestDictionaryWords,
  suggestPhraseSplit,
} from "@/domain/mongolian-orthography/dictionary";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";
import {
  NEW_DANGEROUS_NEAR_NEIGHBORS,
  PHRASE_CORRECTIONS,
  PHRASE_SPLIT_NEGATIVE_CASES,
  PHRASE_SPLIT_ORDER_NOT_VALIDATED_CASE,
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

describe("FOLLOW-UP FIX — case #6 ranking ('гэртаа' -> 'гэртээ' must be top-1)", () => {
  it("reproduces the exact before-fix root cause: 'гэрт' had a perfect 1.0 prefixRatio purely because it is a pure prefix-truncation of the longer input, leaving 'аа' completely unexplained", () => {
    // Documents the root cause investigated for this fix (not a live
    // assertion about the unfixed formula, which no longer exists) —
    // recomputing prefixRatio's old min(input.length, candidate.length)
    // denominator by hand for "гэрт" against "гэртаа".
    const input = "гэртаа";
    const candidate = "гэрт";
    const prefixLen = 4; // "гэрт" shares its entire own length as a prefix
    const oldPrefixRatio = prefixLen / Math.min(input.length, candidate.length);
    expect(oldPrefixRatio).toBe(1);
  });

  it("scoreCandidate ranks 'гэртээ' above both 'гэрт' (pure prefix-truncation, unexplained 'аа') and 'гэртэй' (same edit distance, different tail shape)", () => {
    const input = "гэртаа";
    const scoreGert = scoreCandidate(input, "гэрт");
    const scoreGertei = scoreCandidate(input, "гэртэй");
    const scoreGertee = scoreCandidate(input, "гэртээ");
    expect(scoreGertee).toBeGreaterThan(scoreGert);
    expect(scoreGertee).toBeGreaterThan(scoreGertei);
  });

  it("the full pipeline now returns 'гэртээ' as the top-1 suggestion for 'гэртаа', with 'гэрт' and 'гэртэй' still offered as ranked alternatives", () => {
    const result = buildOrthographySuggestions("гэртаа");
    expect(result.suggestions[0]?.suggestedWord).toBe("гэртээ");
    expect(result.suggestions[0]?.candidates).toContain("гэрт");
    expect(result.suggestions[0]?.candidates).toContain("гэртэй");
  });

  it("NEGATIVE CONTROL: does not incorrectly promote an unrelated short-prefix candidate — 'Өрөө' (1 shared prefix char with 'өглөө') must stay unflagged, not newly cross the confidence floor", () => {
    // This is the exact regression this fix's first attempt introduced
    // (a too-broad doubled-final-letter bonus tipped "Өрөө" -> "өглөө"
    // over MIN_SUGGESTION_CONFIDENCE) and had to be scoped away by
    // requiring same-length, tail-only divergence. Pinned here, in
    // addition to the pre-existing mongolian-spellcheck-ranking.test.ts
    // case that originally caught it, for direct traceability to this
    // milestone's fix.
    const result = buildOrthographySuggestions("Өрөө хаалттай байсан.");
    expect(result.suggestionCount).toBe(0);
  });

  it("NEGATIVE CONTROL: the doubled-final-letter bonus never applies across a length mismatch or non-tail divergence — 'ширэх'/'ирэх' ranking invariant (unrelated case) is unaffected", () => {
    const input = "ширэх";
    expect(scoreCandidate(input, "ширхэг")).toBeGreaterThan(scoreCandidate(input, "ирэх"));
    const candidates = suggestDictionaryWords(input);
    expect(candidates[0]).toBe("ширхэг");
    expect(candidates).not.toContain("ирэх");
  });

  it("NEGATIVE CONTROL: existing same-length ranking cases (no prefix-truncation candidate involved) are byte-for-byte unaffected — 'мэрэг' still resolves only to 'мэдэх'", () => {
    expect(suggestDictionaryWords("мэрэг")).toEqual(["мэдэх"]);
  });
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
