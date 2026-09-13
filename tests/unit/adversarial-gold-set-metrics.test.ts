import { describe, expect, it } from "vitest";

import { isKnownMongolianWord, suggestDictionaryWords } from "@/domain/mongolian-orthography/dictionary";
import {
  CURATED_TYPO_MAP_CASES,
  DANGEROUS_NEAR_NEIGHBORS,
  MORPHOLOGY_BOUNDARY_CASES,
  TYPO_CORRECTIONS,
  UNKNOWN_WORDS,
  VALID_INFLECTED_FORMS,
  VALID_LEGAL_TERMS,
  VALID_WORDS,
} from "../evaluation/adversarial-gold-set";

/**
 * Milestone 7 (adversarial orthography evaluation), Section 8: executable
 * regression guard for the OFFLINE GOLD-SET EVALUATION metrics (see
 * scripts/compute-gold-set-metrics.ts for the human-readable report this
 * mirrors). This file exists so a future change that quietly drops one of
 * these rates below 100% on the SAFETY-CRITICAL categories fails CI, not
 * just a manually-run report.
 *
 * These are NOT production accuracy claims — see the script's own header
 * comment and Section 8 of the milestone spec for why: this is a small,
 * hand-picked, adversarially-selected gold set, not a representative
 * sample of real user input. The two "informational only" metrics
 * (typo top-1, silent-on-unknown) have denominators under 10 and are
 * asserted as non-regressions, not treated as generalizable percentages.
 */

describe("OFFLINE GOLD-SET EVALUATION — safety-critical rates must stay at 100%", () => {
  it("valid-word safety rate is 100% (every valid word + legal term stays known and silent)", () => {
    const cases = [...VALID_WORDS, ...VALID_LEGAL_TERMS];
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const { word } of cases) {
      expect(isKnownMongolianWord(word)).toBe(true);
      expect(suggestDictionaryWords(word)).toEqual([]);
    }
  });

  it("dangerous-confusion safety rate is 100% (no near-neighbor pair is ever corrected into the other)", () => {
    expect(DANGEROUS_NEAR_NEIGHBORS.length).toBeGreaterThanOrEqual(10);
    for (const { wordA, wordB } of DANGEROUS_NEAR_NEIGHBORS) {
      expect(isKnownMongolianWord(wordA)).toBe(true);
      expect(isKnownMongolianWord(wordB)).toBe(true);
      expect(suggestDictionaryWords(wordA)).toEqual([]);
      expect(suggestDictionaryWords(wordB)).toEqual([]);
    }
  });

  it("morphology safety rate is 100% (every inflected/boundary case matches its expected known-status)", () => {
    const cases = [
      ...VALID_INFLECTED_FORMS.map((c) => ({ word: c.word, expectedKnown: true })),
      ...MORPHOLOGY_BOUNDARY_CASES.map((c) => ({ word: c.word, expectedKnown: c.expectedKnown })),
    ];
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const { word, expectedKnown } of cases) {
      expect(isKnownMongolianWord(word)).toBe(expectedKnown);
    }
  });
});

describe("OFFLINE GOLD-SET EVALUATION — informational-only rates (denominator < 10, tracked as non-regressions, not generalizable percentages)", () => {
  it("typo top-1 success rate: 7/7 on the current gold set", () => {
    const allTypoCases = [
      ...CURATED_TYPO_MAP_CASES.map((c) => ({ input: c.input, expected: c.expectedCandidate })),
      ...TYPO_CORRECTIONS.map((c) => ({ input: c.input, expected: c.expectedCandidate })),
    ];
    expect(allTypoCases.length).toBeLessThan(10); // documents that this IS the small-sample regime
    for (const { input, expected } of allTypoCases) {
      expect(suggestDictionaryWords(input)[0]).toBe(expected);
    }
  });

  it("silent-on-unknown rate: 4/4 on the current gold set", () => {
    expect(UNKNOWN_WORDS.length).toBeLessThan(10);
    for (const { word } of UNKNOWN_WORDS) {
      expect(isKnownMongolianWord(word)).toBe(false);
    }
  });
});
