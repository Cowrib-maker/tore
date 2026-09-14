/**
 * TORE.MN Orthography V2 — false positive / false negative root-cause
 * fix. Hand-authored regression matrix for the 8 real-user cases
 * reported from production, plus dangerous near-neighbors for every
 * newly introduced correction rule (per the milestone's explicit Phase 7
 * safety mandate). Every expected value here was independently verified
 * against the real engine (not copied from engine output) before being
 * written — see the milestone's own investigation notes in the commit
 * message for the exact root cause behind each entry.
 */

export type KnownWordCase = { word: string; note: string };

/** Words that must be known and silent — no popup, no red underline. */
export const VALID_WORDS: readonly KnownWordCase[] = [
  { word: "хоол", note: "food — was missing from CORE_DICTIONARY_WORDS entirely (case #5)." },
  { word: "байхад", note: "'while/when being' — бай(х) + dative; was a false positive because 'байхад' itself was never registered (case #2)." },
  { word: "хийж", note: "control case: already known before this milestone; must stay silent." },
  { word: "засаж", note: "'fixing/correcting' — newly added as a literal complete word (case #1's correction target)." },
  { word: "ирээд", note: "'having arrived' — newly added as a literal complete word (case #3's correction target)." },
  { word: "надад", note: "'to me' — was already a literal CORE_DICTIONARY_WORDS entry before this milestone." },
  { word: "гэртээ", note: "'at/to one's own home' — was already a literal CORE_DICTIONARY_WORDS entry before this milestone." },
];

export type TypoCase = { input: string; expectedCorrection: string; note: string };

/** Single-token typos that must be corrected to exactly this word (top-1,
 * through the FULL buildOrthographySuggestions pipeline, not just the raw
 * dictionary layer — several of these were silently gated by the §8
 * vowel-harmony highConfidenceOnly restriction before this milestone). */
export const TYPO_CORRECTIONS: readonly TypoCase[] = [
  {
    input: "засэж",
    expectedCorrection: "засаж",
    note: "Case #1. Root cause: 'засаж' wasn't in the dictionary at all (no fuzzy target existed), AND the input trips §8 vowel harmony (э/а mixed), which previously hard-gated suggestions to the tiny COMMON_TYPO_CORRECTIONS map only.",
  },
  {
    input: "ирээт",
    expectedCorrection: "ирээд",
    note: "Case #3. Root cause: 'ирээд' (perfective converb of 'ирэх') wasn't in the dictionary at all.",
  },
  {
    input: "надэд",
    expectedCorrection: "надад",
    note: "Case #4. Root cause: the correction target already existed and fuzzy-ranked correctly (0.598) — the ONLY problem was the §8 harmony highConfidenceOnly gate silencing it in the full pipeline. Confirmed via reproduction: this case was NOT actually broken at the dictionary layer, only at the suggestions.ts pipeline layer, which is why the original report ('NOT detected') only reproduces through buildOrthographySuggestions, not suggestDictionaryWords directly.",
  },
  {
    input: "хииж",
    expectedCorrection: "хийж",
    note: "Case #8, the control case — already worked before this milestone via plain fuzzy matching against the literal 'хийж' entry. Re-verified unchanged.",
  },
  {
    input: "гэртаа",
    expectedCorrection: "гэртээ",
    note: "Case #6, follow-up fix. Root cause: scoreCandidate's prefixRatio divided by min(input.length, candidate.length), so a candidate that is a pure, complete prefix-truncation of the input ('гэрт') always scored a perfect 1.0 prefix ratio regardless of unexplained trailing input characters. Fixed by measuring prefix coverage against the full input length in that specific case, plus a narrowly-scoped bonus (tail-only divergence, same length) for a candidate that preserves the input's doubled-final-letter shape, which was needed to also break the exact tie between 'гэртэй' and 'гэртээ' (both differ from 'гэртаа' by two same-category vowel substitutions under weightedLevenshteinDistance, since 'й' is classified as a vowel). See dictionary.ts's scoreCandidate for the exact change.",
  },
];

export type PhraseCase = { input: string; expectedCorrection: string; note: string };

/** Multi-token / clitic-boundary corrections — a genuinely different
 * mechanism (suggestPhraseSplit) from single-word fuzzy ranking. */
export const PHRASE_CORRECTIONS: readonly PhraseCase[] = [
  {
    input: "биздээ",
    expectedCorrection: "биз дээ",
    note: "Case #7. 'биз' (modal particle, ~surely) + 'дээ' (sentence-final particle, ~isn't it) glued together. Root cause: neither particle was in the dictionary, AND there was no mechanism to suggest a space-inserted correction at all.",
  },
];

// Case #6 ("гэртаа" -> "гэртээ") was the last entry ever held here (a
// ranking gap disclosed rather than hidden, per this milestone's "do not
// hide remaining limitations" convention) — it was fixed in the follow-up
// milestone; see the "гэртаа" entry in TYPO_CORRECTIONS above and
// scoreCandidate in dictionary.ts.

export type DangerousPairCase = { wordA: string; wordB: string; note: string };

/**
 * Dangerous near-neighbors specifically for the NEW correction rules
 * added this milestone — proving the new literal words / particle set /
 * confidence-gate change didn't create a new false-positive risk.
 */
export const NEW_DANGEROUS_NEAR_NEIGHBORS: readonly DangerousPairCase[] = [
  { wordA: "засаж", wordB: "засах", note: "Both newly-added literal forms of 'зас' (to fix) — must never be corrected into each other." },
  { wordA: "ирээд", wordB: "ирэх", note: "New 'ирээд' vs. the pre-existing 'ирэх' — distance 2, must both stay silent." },
  { wordA: "байхад", wordB: "байх", note: "New 'байхад' vs. the pre-existing 'байх' — must both stay silent, neither corrects into the other." },
  { wordA: "хоол", wordB: "хот", note: "New 'хоол' vs. the pre-existing 'хот' (edit distance 2) — both real, unrelated words; must both stay silent." },
  { wordA: "хоол", wordB: "хор", note: "New 'хоол' vs. the pre-existing 'хор' — same concern, different neighbor." },
];

export type PhraseNegativeCase = {
  input: string;
  note: string;
};

/**
 * Negative cases for suggestPhraseSplit — tokens that must NOT trigger a
 * phrase-split suggestion, proving the mechanism does not "aggressively
 * split arbitrary words" (the milestone's explicit Phase 6 warning).
 */
export const PHRASE_SPLIT_NEGATIVE_CASES: readonly PhraseNegativeCase[] = [
  {
    input: "дээрхи",
    note: "Contains 'дээ' as a substring but the remainder at every split point ('р','рхи','хи', etc.) is never itself a known word or a recognized particle — must not phrase-split. Verified: returns null.",
  },
  {
    input: "хэрэгдээ",
    note: "Already a KNOWN word (matchesMorphology recognizes 'хэрэг' + suffix 'дээ') — must be silent via the ordinary known-word path and never even reach phrase-split logic (suggestPhraseSplit's own first check is isKnownMongolianWord). Verified: known=true, phraseSplit=null.",
  },
];

/**
 * NOT a negative case — documents a real, disclosed boundary of the
 * mechanism rather than hiding it: suggestPhraseSplit checks only "is
 * there exactly one valid particle-boundary split", not whether the
 * resulting two-word order is itself a linguistically sensible
 * collocation. "гэрбиз" (synthetic, not a real reported error) splits to
 * "гэр биз" because "гэр" is a known word and "биз" is a recognized
 * particle — even though "биз" preceding a bare noun like this isn't an
 * idiomatic real phrase. The risk is bounded by PHRASE_BOUNDARY_PARTICLES
 * staying small and deliberately curated (currently just "биз"/"дээ"),
 * not by this milestone claiming word-order plausibility is checked.
 */
export const PHRASE_SPLIT_ORDER_NOT_VALIDATED_CASE = {
  input: "гэрбиз",
  actualResult: "гэр биз",
  note: "Documents current behavior; not asserted as either a bug or a feature to preserve — a future milestone could legitimately tighten this.",
} as const;
