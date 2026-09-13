import { describe, expect, it } from "vitest";

import { scoreCandidate } from "@/domain/mongolian-orthography/dictionary";
import { levenshteinDistance, weightedLevenshteinDistance } from "@/domain/mongolian-orthography/levenshtein";

/**
 * Milestone 7 (adversarial orthography evaluation), Section 2: systematic,
 * deterministic stress tests of scoreCandidate() itself — the ranking
 * algorithm — across the structural dimensions the task lists (edit
 * distance 1/2, prefix, stem, suffix-only, vowel-harmony mismatch,
 * consonant substitution, transposition, insertion, deletion, doubled
 * letters, Cyrillic lookalikes).
 *
 * These are deterministic, hand-constructed parameterized cases, not
 * randomized/property-based fuzzing: no property-testing library
 * (fast-check, jsverify, etc.) is present in this repo (confirmed via
 * `grep -iE "fast-check|jsverify|testcheck|fuzz" package.json` -> no
 * matches), and the task explicitly said not to add a large dependency
 * merely for this milestone. Every input/candidate pair and every
 * asserted score below was computed by running the real scoreCandidate()
 * against the shipped engine and reading back the actual number — nothing
 * here is an assumed or aspirational value (see individual comments for
 * the measured baseline each assertion is pinned to).
 *
 * Where a test compares scoreCandidate on two candidates for the same
 * input, the *design intent* stated in each comment is what the pair is
 * built to isolate — scoreCandidate is a weighted combination of five
 * signals (see its own doc comment in dictionary.ts), so most natural
 * language pairs mix several dimensions at once; where a pair below
 * cleanly isolates one dimension (matched distance and prefix ratio, only
 * one candidate stem-sharing) that is called out explicitly.
 */

describe("edit distance 1 vs edit distance 2 (equal prefix)", () => {
  it("a same-prefix candidate at distance 1 outranks a same-prefix candidate at distance 2", () => {
    // Both candidates share the full "асуудав"/"асуудвг" length-7 shape
    // and the 5-letter prefix "асууд" with the input; only the tail
    // differs by one extra edit.
    const input = "асуудал";
    const distance1 = "асуудав"; // 1 substitution (л -> в)
    const distance2 = "асуудвг"; // 2 substitutions (а->в, л->г)
    expect(levenshteinDistance(input, distance1)).toBe(1);
    expect(levenshteinDistance(input, distance2)).toBe(2);
    const score1 = scoreCandidate(input, distance1);
    const score2 = scoreCandidate(input, distance2);
    expect(score1).toBeGreaterThan(score2);
    // Measured baseline: 0.806 vs 0.549 — regression floor with margin.
    expect(score1).toBeGreaterThan(0.7);
    expect(score2).toBeLessThan(0.6);
  });
});

describe("same prefix vs different prefix (equal raw edit distance) — Invariant 2", () => {
  it("a same-first-letter candidate massively outranks a different-first-letter candidate at the same edit distance", () => {
    const input = "хэрэг";
    const samePrefix = "хэрэв"; // shares "хэрэ", 1 substitution at the end
    const diffPrefix = "мэрэг"; // shares nothing at the start, 1 substitution at the start
    expect(levenshteinDistance(input, samePrefix)).toBe(1);
    expect(levenshteinDistance(input, diffPrefix)).toBe(1);
    const scoreSame = scoreCandidate(input, samePrefix);
    const scoreDiff = scoreCandidate(input, diffPrefix);
    expect(scoreSame).toBeGreaterThan(scoreDiff);
    // Measured baseline: 0.768 vs 0.077 — this is the zero-prefix-overlap
    // ×0.3 penalty in action (Invariant 2's structural-relatedness rule),
    // not a marginal difference, so a wide, safe margin is asserted.
    expect(scoreSame - scoreDiff).toBeGreaterThan(0.5);
    expect(scoreDiff).toBeLessThan(0.2);
  });
});

describe("shared stem vs no shared stem (equal distance, equal prefix ratio) — isolates the stem bonus", () => {
  it("a candidate sharing a known stem outranks an otherwise-identical candidate that doesn't", () => {
    // Both candidates are length 8, distance 2 from the input, and share
    // the input's full 6-letter prefix "хэрэгт" — the ONLY structural
    // difference is that "хэрэгтэй" strips to the known stem "хэрэг"
    // (shared with the input's own stripped stem) while "хэрэгтмн" strips
    // to nothing recognizable.
    const input = "хэрэгт";
    const stemShared = "хэрэгтэй";
    const stemNotShared = "хэрэгтмн";
    expect(levenshteinDistance(input, stemShared)).toBe(2);
    expect(levenshteinDistance(input, stemNotShared)).toBe(2);
    const scoreShared = scoreCandidate(input, stemShared);
    const scoreNotShared = scoreCandidate(input, stemNotShared);
    expect(scoreShared).toBeGreaterThan(scoreNotShared);
    // Measured baseline: 0.825 vs 0.675 — a gap of exactly 0.15, matching
    // scoreCandidate's documented stem-bonus weight precisely.
    expect(scoreShared - scoreNotShared).toBeCloseTo(0.15, 2);
  });
});

describe("suffix-only similarity (shared tail, no shared prefix or stem) — must be heavily penalized", () => {
  it("a same-root candidate needing MORE edits outranks a suffix-only-similar candidate needing FEWER edits (the ширэх/ирэх/ширхэг case)", () => {
    // "ирэх" shares only the tail "ирэх" with "ширэх" (distance 1, but
    // zero prefix overlap and no shared stem); "ширхэг" shares the
    // "шир" root (distance 2, real prefix + stem relationship). The
    // structurally-related candidate must win despite needing a larger
    // edit — this is the exact original 0577f94 false-positive report.
    const input = "ширэх";
    const suffixOnly = "ирэх";
    const sameRoot = "ширхэг";
    expect(levenshteinDistance(input, suffixOnly)).toBe(1);
    expect(levenshteinDistance(input, sameRoot)).toBe(2);
    const scoreSuffixOnly = scoreCandidate(input, suffixOnly);
    const scoreSameRoot = scoreCandidate(input, sameRoot);
    expect(scoreSameRoot).toBeGreaterThan(scoreSuffixOnly);
    // Measured baseline: 0.555 vs 0.093 — suffix-only similarity scores
    // far below MIN_SUGGESTION_CONFIDENCE (0.4) despite the smaller edit.
    expect(scoreSuffixOnly).toBeLessThan(0.4);
    expect(scoreSameRoot).toBeGreaterThan(0.4);
  });
});

describe("vowel-harmony mismatch", () => {
  it("a harmony-violating spelling still scores low against the correct elided form, rather than being treated as an obviously-superior fix", () => {
    // "ажилээс" (feminine ээс wrongly attached to masculine ажил) vs the
    // actually-correct elided ablative "ажлаас" — measures the distance
    // this specific harmony confusion produces, so a future ranking
    // change that suddenly makes this an aggressive high-confidence
    // "correction" would be caught here.
    const wrongHarmony = "ажилээс";
    const correctForm = "ажлаас";
    const score = scoreCandidate(wrongHarmony, correctForm);
    // Measured baseline: 0.347 — comfortably below MIN_SUGGESTION_CONFIDENCE
    // (0.4), consistent with isKnownMongolianWord("ажилээс") already being
    // true (so suggestDictionaryWords never even reaches this scoring path
    // in practice — see the MORPHOLOGY_BOUNDARY_CASES gold-set entry for
    // that documented, deferred limitation).
    expect(score).toBeLessThan(0.4);
  });
});

describe("consonant substitution: same-category vs different-category", () => {
  it("weightedLevenshteinDistance is <= plain levenshteinDistance for a same-category liquid substitution (р -> л)", () => {
    // "хэрэг" -> "хэлэг": р and л are both liquid consonants, one of the
    // "cheaper" same-category slips scoreCandidate's own doc comment
    // describes. This checks the weighting exists and moves the expected
    // direction, without asserting a specific category taxonomy this
    // suite doesn't own.
    const input = "хэрэг";
    const sameCategory = "хэлэг";
    expect(weightedLevenshteinDistance(input, sameCategory)).toBeLessThanOrEqual(
      levenshteinDistance(input, sameCategory),
    );
  });

  it("both a same-category and a different-category single-consonant substitution keep full prefix overlap through the changed letter's position", () => {
    // Regardless of whether the substituted consonant is phonetically
    // "close" or not, the shared PREFIX up to the point of change must
    // still contribute full credit — this is what lets ranking recover
    // from a consonant slip in either direction. Measured baseline for
    // both: 0.438 (the prefix-driven floor for this particular pair
    // shape), confirming prefix credit does not silently vanish just
    // because a category difference exists.
    const input = "хэрэг";
    const sameCategory = "хэлэг"; // р/л, both liquids
    const diffCategory = "хэпэг"; // р/п, liquid vs stop
    expect(scoreCandidate(input, sameCategory)).toBeCloseTo(0.438, 2);
    expect(scoreCandidate(input, diffCategory)).toBeCloseTo(0.438, 2);
  });
});

describe("transposition (adjacent letters swapped)", () => {
  it("a transposition that also destroys the shared prefix scores far below MIN_SUGGESTION_CONFIDENCE", () => {
    // "шүүх" -> "үшүх": swapping the first two letters both costs 2 raw
    // edits under plain Levenshtein (no transposition-aware metric exists
    // in this engine) AND destroys prefix overlap entirely — a
    // documented, evidence-based limitation (no Damerau-Levenshtein),
    // not a silent gap: this test exists specifically so a future change
        // to the distance metric doesn't accidentally make transposed input
    // score dangerously high without anyone noticing.
    const input = "шүүх";
    const transposed = "үшүх";
    expect(levenshteinDistance(input, transposed)).toBe(2);
    const score = scoreCandidate(input, transposed);
    expect(score).toBeLessThan(0.4);
  });
});

describe("insertion and deletion", () => {
  it("a single trailing-letter insertion keeps a high score (full prefix retained)", () => {
    const input = "шүүх";
    const inserted = "шүүхэ";
    expect(levenshteinDistance(input, inserted)).toBe(1);
    expect(scoreCandidate(input, inserted)).toBeGreaterThan(0.6);
  });

  it("a single interior-letter deletion keeps a moderate-to-high score (prefix retained up to the deletion point)", () => {
    const input = "шүүх";
    const deleted = "шүх";
    expect(levenshteinDistance(input, deleted)).toBe(1);
    expect(scoreCandidate(input, deleted)).toBeGreaterThan(0.4);
  });
});

describe("doubled consonants and doubled vowels", () => {
  it("a doubled interior consonant scores high enough to be a viable suggestion (a plausible fat-finger repeat)", () => {
    const input = "эрх";
    const doubledConsonant = "эррх";
    expect(levenshteinDistance(input, doubledConsonant)).toBe(1);
    expect(scoreCandidate(input, doubledConsonant)).toBeGreaterThan(0.4);
  });

  it("a doubled leading vowel scores lower than a doubled interior consonant, because it disturbs the shared prefix from position 0", () => {
    const input = "эрх";
    const doubledVowel = "ээрх"; // doubles э at position 0 -> shifts the rest of the prefix
    const doubledConsonant = "эррх";
    expect(levenshteinDistance(input, doubledVowel)).toBe(1);
    const scoreVowel = scoreCandidate(input, doubledVowel);
    const scoreConsonant = scoreCandidate(input, doubledConsonant);
    // Measured baseline: 0.375 vs 0.525 — both still plausible, but the
    // leading-position edit costs more prefix credit than an interior one.
    expect(scoreVowel).toBeLessThan(scoreConsonant);
  });
});

describe("Cyrillic/Latin lookalikes", () => {
  it("a single Latin-letter substitution for a visually-identical Cyrillic letter scores far below MIN_SUGGESTION_CONFIDENCE against the real word", () => {
    // U+0061 LATIN SMALL LETTER A substituted for U+0430 CYRILLIC SMALL
    // LETTER A at the front of "асуудал" — visually indistinguishable to
    // a human, but scoreCandidate treats it as a leading-position
    // mismatch like any other, so it does NOT get a special "this looks
    // identical" boost. This is the safe/expected behavior: a homoglyph
    // typo should score like the ordinary leading-letter edit it
    // structurally is, not silently pass as already-correct (that
    // silence, or lack of it, is checked at the tokenizer/dictionary
    // level in the OCR_GARBAGE / adversarial-gold-set cases instead).
    const real = "асуудал";
    const latinPrefixed = `a${real.slice(1)}`;
    expect(real.codePointAt(0)).not.toBe(latinPrefixed.codePointAt(0));
    const score = scoreCandidate(real, latinPrefixed);
    expect(score).toBeLessThan(0.4);
  });
});
