/**
 * Adversarial evaluation gold set — "EVALUATION_ONLY" layer, milestone 6.
 *
 * NOTHING in this file is imported by dictionary.ts, suggestions.ts, or
 * corpus-vocabulary.ts. Expected outcomes below were determined BEFORE
 * (or independent of) trusting the engine's own output: every
 * DANGEROUS_NEAR_NEIGHBORS pair and every TYPO_CORRECTIONS entry was
 * found by systematically scanning the REAL shipped dictionary for
 * genuine edit-distance-1/2 collisions (via the test-only
 * completeWordsForTests() export), then manually judging — by knowing
 * what each Mongolian word actually means — whether the pair is a real
 * semantic collision risk. Nothing here is a mechanically-generated
 * "expected = whatever the engine currently outputs" case.
 *
 * This complements, and does not duplicate, tests/evaluation/mongolian-
 * legal-gold-set.ts (the corpus-vocabulary classification gold set from
 * the previous milestone) — this file is about RANKING/MATCHING safety
 * under adversarial spelling conditions, not vocabulary classification.
 */

// ---------------------------------------------------------------------
// 1. VALID_WORDS — ordinary words that must stay silent even though each
//    has a real, close dictionary neighbor a naive matcher could confuse
//    it with (see DANGEROUS_NEAR_NEIGHBORS below for the pairing).
// ---------------------------------------------------------------------
export type ValidWordCase = { word: string; expected: "SILENT"; note: string };

export const VALID_WORDS: readonly ValidWordCase[] = [
  { word: "гэр", expected: "SILENT", note: "'house/ger' — one edit from тэр ('that/he'), a completely different word class (noun vs. pronoun)." },
  { word: "тэр", expected: "SILENT", note: "'that/he' — the other half of the гэр pair." },
  { word: "хор", expected: "SILENT", note: "'poison/harm' — one edit from хот ('city') and from хоёр ('two')." },
  { word: "хот", expected: "SILENT", note: "'city' — one edit from хор." },
  { word: "хэн", expected: "SILENT", note: "'who' — one edit from хүн ('person'); an interrogative pronoun vs. a noun." },
  { word: "хүн", expected: "SILENT", note: "'person' — the other half of the хэн pair, and itself the task's own example of an 'ordinary word occurring in legal text'." },
  { word: "ном", expected: "SILENT", note: "'book' — one edit from том ('big')." },
  { word: "том", expected: "SILENT", note: "'big' — the other half of the ном pair." },
  { word: "энэ", expected: "SILENT", note: "'this' — one edit from үнэ ('price')." },
  { word: "үнэ", expected: "SILENT", note: "'price' — the other half of the энэ pair." },
  { word: "минь", expected: "SILENT", note: "'my' (possessive particle) — one edit from чинь ('your'); correcting one into the other silently changes who owns something." },
  { word: "чинь", expected: "SILENT", note: "'your' — the other half of the минь pair." },
  { word: "тэд", expected: "SILENT", note: "'they' — one edit from тэр ('that/he'); different grammatical number." },
];

// ---------------------------------------------------------------------
// 2. VALID_LEGAL_TERMS — from the task's own example list, each
//    independently confirmed already known.
// ---------------------------------------------------------------------
export const VALID_LEGAL_TERMS: readonly ValidWordCase[] = [
  { word: "зүйл", expected: "SILENT", note: "statute 'article'." },
  { word: "хэсэг", expected: "SILENT", note: "statute 'section/part' — see DANGEROUS_NEAR_NEIGHBORS: one edit from хэрэг ('case/matter')." },
  { word: "заалт", expected: "SILENT", note: "'provision/clause' — one edit from хаалт ('lock/closure'), the original 0577f94 report." },
  { word: "дугаар", expected: "SILENT", note: "'number' (ordinal-numbering particle)." },
  { word: "тогтоол", expected: "SILENT", note: "'resolution/decree'." },
  { word: "шийдвэр", expected: "SILENT", note: "'decision/ruling'." },
  { word: "нэхэмжлэл", expected: "SILENT", note: "'claim/complaint'." },
  { word: "прокурор", expected: "SILENT", note: "'prosecutor'." },
  { word: "өмгөөлөгч", expected: "SILENT", note: "'defense counsel'." },
  { word: "шүүх", expected: "SILENT", note: "'court'." },
  { word: "мөрдөн", expected: "SILENT", note: "investigative stem ('мөрдөн шалгах' = to investigate)." },
  { word: "эрх", expected: "SILENT", note: "'right' — the single most frequent LEGAL-bucket word in the 59-document evaluation corpus, and the task's own example of a word that isn't EXCLUSIVELY legal vocabulary." },
  { word: "үүрэг", expected: "SILENT", note: "'duty/obligation'." },
  { word: "хэрэг", expected: "SILENT", note: "'case/matter' — see DANGEROUS_NEAR_NEIGHBORS: one edit from both хэсэг and хэрэв." },
  { word: "нотлох", expected: "SILENT", note: "'to prove' (as in 'нотлох баримт' = evidence)." },
  { word: "баримт", expected: "SILENT", note: "'evidence/document'." },
];

/** захирамж/яллагдагч/сэжигтэн are deliberately NOT here: confirmed
 * genuinely absent from both the hand-curated dictionary and the
 * 59-document evaluation corpus (see LEGAL_TERM_SET in the other gold
 * set). Listing them as "should be silent" would be misleading — they
 * are currently NOT silent, they are correctly (if unhelpfully) flagged
 * as unknown with no suggestion. That is the UNKNOWN_WORDS category
 * below, not this one.
 */

// ---------------------------------------------------------------------
// 3. VALID_INFLECTED_FORMS — case/suffix-marked forms that must resolve
//    to "known" via the generic morphology matcher.
// ---------------------------------------------------------------------
export const VALID_INFLECTED_FORMS: readonly ValidWordCase[] = [
  { word: "хэргээс", expected: "SILENT", note: "ablative on хэрэг, with vowel elision." },
  { word: "асуудлыг", expected: "SILENT", note: "accusative on асуудал, with vowel elision." },
  { word: "ажлаас", expected: "SILENT", note: "ablative (masculine harmony) on ажил, with vowel elision — the CORRECT form, as opposed to the harmony-mismatched 'ажилээс' that the pre-fix generator used to also register." },
  { word: "ажилтай", expected: "SILENT", note: "comitative (masculine harmony, matches ажил's own vowel class) on ажил." },
  { word: "гэрээг", expected: "SILENT", note: "accusative on the vowel-final stem гэрээ — recognized generically via matchesMorphology even after removing bare '-г' from blanket short-suffix pre-generation." },
  { word: "хуульчид", expected: "SILENT", note: "-ид plural on хуульч (f8831e2 fix)." },
  { word: "явлаа", expected: "SILENT", note: "past-perfective on the verb stem яв (f8831e2 fix)." },
  { word: "заалтуудыг", expected: "SILENT", note: "plural + accusative (suffix chain) on заалт." },
];

// ---------------------------------------------------------------------
// 4. TYPO_CORRECTIONS — explicit expected candidate, minimum acceptable
//    confidence (scoreCandidate's 0..1 scale), and whether a correction
//    should occur at all.
//
// Every minConfidence below is the REAL measured scoreCandidate() value
// (or just under it), not an assumed/aspirational number — measured via a
// scratch script against the shipped engine before being written here.
// suggestDictionaryWords() actually has TWO distinct correction paths, and
// this list keeps them in separate sub-arrays because "confidence" means
// something different for each:
//   - CURATED_TYPO_MAP_CASES: COMMON_TYPO_CORRECTIONS is a hand-curated,
//     exact-match table (dictionary.ts) consulted BEFORE fuzzy ranking —
//     scoreCandidate() is never called for these, so a "minConfidence"
//     number would be meaningless; the check is that the map fires and
//     resolves to a real known word.
//   - FUZZY_TYPO_CASES: no exact map entry exists, so the result comes
//     entirely from rankFuzzyCandidates()/scoreCandidate(), and
//     minConfidence is a genuine regression floor on that score.
// ---------------------------------------------------------------------
export type CuratedTypoCase = { input: string; expectedCandidate: string; note: string };

export const CURATED_TYPO_MAP_CASES: readonly CuratedTypoCase[] = [
  {
    input: "хунэтаи",
    expectedCandidate: "хүнтэй",
    note: "Resolved via the hand-curated COMMON_TYPO_CORRECTIONS exact-match table, not scoreCandidate ranking — verified: scoreCandidate('хунэтаи','хүнтэй') is only ~0.31, well under MIN_SUGGESTION_CONFIDENCE (0.4), so without the curated map this correction would NOT fire at all. This is itself worth tracking: it shows the curated map is load-bearing for this specific typo, not a redundant convenience.",
  },
];

export type TypoCase = {
  input: string;
  expectedCandidate: string;
  minConfidence: number;
  shouldCorrect: true;
  note: string;
};

export const TYPO_CORRECTIONS: readonly TypoCase[] = [
  {
    input: "ширэх",
    expectedCandidate: "ширхэг",
    minConfidence: 0.5,
    shouldCorrect: true,
    note: "Standing regression (0577f94). Verified: scoreCandidate(ширэх,ширхэг)=0.555.",
  },
  {
    input: "зорчил",
    expectedCandidate: "зөрчил",
    minConfidence: 0.4,
    shouldCorrect: true,
    note: "Missing ө, same-category vowel substitution. Verified: scoreCandidate(зорчил,зөрчил)=0.41 — just above MIN_SUGGESTION_CONFIDENCE (0.4); this is a real, if modest, confidence margin, not a strong one, and is worth watching for regression.",
  },
  {
    input: "шиидвэр",
    expectedCandidate: "шийдвэр",
    minConfidence: 0.45,
    shouldCorrect: true,
    note: "Doubled и for й. Verified: scoreCandidate(шиидвэр,шийдвэр)=0.469.",
  },
  {
    input: "хэрг",
    expectedCandidate: "хэрэг",
    minConfidence: 0.6,
    shouldCorrect: true,
    note: "Elided vowel — must prefer хэрэг over the equally-close-by-raw-edit-distance neighbor хэсэг ('section'). Verified: scoreCandidate(хэрг,хэрэг)=0.6475 vs scoreCandidate(хэрг,хэсэг)=0.423.",
  },
  {
    input: "марган",
    expectedCandidate: "маргаан",
    minConfidence: 0.65,
    shouldCorrect: true,
    note: "Must resolve to 'dispute', not the other dangerous neighbor 'маргааш' (tomorrow) — the two share a 5-letter prefix and are both one edit away in different directions from adjacent typos. Verified: scoreCandidate(марган,маргаан)=0.702 vs scoreCandidate(марган,маргааш)=0.672 — correctly ordered, though close enough (0.03 apart) to also serve as an ambiguity-margin check.",
  },
  {
    input: "маргаш",
    expectedCandidate: "маргааш",
    minConfidence: 0.65,
    shouldCorrect: true,
    note: "The reverse-direction typo of the previous case — must resolve to 'tomorrow', not 'dispute'. Confirms the ranking genuinely disambiguates by the actual spelling difference, not just by picking one side of the pair arbitrarily. Verified: scoreCandidate(маргаш,маргааш)=0.702.",
  },
];

// ---------------------------------------------------------------------
// 5. DANGEROUS_NEAR_NEIGHBORS — pairs of real, independently-valid
//    dictionary words at edit distance 1, found by systematically
//    scanning completeWordsForTests() with levenshteinDistance and then
//    manually judging semantic relatedness. expected = NO_CORRECTION for
//    both members: an already-known word must never be evaluated for
//    correction at all (suggestDictionaryWords short-circuits on
//    isKnownMongolianWord before any ranking runs), so this is really an
//    architectural invariant check (see Invariant 1) applied to the
//    specific highest-risk pairs this corpus's own vocabulary contains.
// ---------------------------------------------------------------------
export type DangerousPairCase = {
  wordA: string;
  wordB: string;
  expected: "NO_CORRECTION";
  note: string;
};

export const DANGEROUS_NEAR_NEIGHBORS: readonly DangerousPairCase[] = [
  { wordA: "хаалттай", wordB: "заалттай", expected: "NO_CORRECTION", note: "Original f8831e2 false-positive report." },
  { wordA: "ширхэг", wordB: "ирэх", expected: "NO_CORRECTION", note: "Original 0577f94 false-positive report." },
  { wordA: "хэрэг", wordB: "хэсэг", expected: "NO_CORRECTION", note: "'case/matter' vs 'section/part' — both on the task's own legal-term example list, distance 1 (р/с)." },
  { wordA: "хэрэг", wordB: "хэрэв", expected: "NO_CORRECTION", note: "'case/matter' vs 'if' — distance 1 (г/в), carried over from the classification-safety milestone's gold set." },
  { wordA: "хэн", wordB: "хүн", expected: "NO_CORRECTION", note: "'who' vs 'person' — distance 1 (э/ү), different parts of speech entirely." },
  { wordA: "гэр", wordB: "тэр", expected: "NO_CORRECTION", note: "'house' vs 'that/he' — distance 1 (г/т)." },
  { wordA: "минь", wordB: "чинь", expected: "NO_CORRECTION", note: "'my' vs 'your' — a meaning-inverting possessive-particle confusion." },
  { wordA: "маргаан", wordB: "маргааш", expected: "NO_CORRECTION", note: "'dispute' (a legal term) vs 'tomorrow' — share a 5-letter prefix, distance 1." },
  { wordA: "ном", wordB: "том", expected: "NO_CORRECTION", note: "'book' vs 'big'." },
  { wordA: "энэ", wordB: "үнэ", expected: "NO_CORRECTION", note: "'this' vs 'price'." },
];

// ---------------------------------------------------------------------
// 6/7. PROPER_NOUNS / ABBREVIATIONS — carried forward and re-verified,
//      not duplicated in full (see mongolian-legal-gold-set.ts for the
//      classification-level detail); here purely for the ranking-safety
//      claim: a proper noun or abbreviation must never surface as a
//      "correction" for an ordinary word or vice versa.
// ---------------------------------------------------------------------
export const PROPER_NOUN_RANKING_CASES: readonly { word: string; note: string }[] = [
  { word: "Сүхбаатар", note: "A real district/person name — must never be offered as a correction for any ordinary lowercase word, and typing it correctly must never itself be flagged." },
];

export const ABBREVIATION_RANKING_CASES: readonly { word: string; note: string }[] = [
  { word: "НҮБ", note: "United Nations — must never be silently expanded or offered as a correction for an unrelated word." },
];

// ---------------------------------------------------------------------
// 8. LEGAL_CITATIONS — citation-shaped fragments inside realistic legal
//    sentences that must never become spelling candidates.
// ---------------------------------------------------------------------
export type LegalCitationCase = { text: string; citationFragment: string; note: string };

export const LEGAL_CITATIONS: readonly LegalCitationCase[] = [
  { text: "Эрүүгийн хуулийн 12.3 дугаар зүйлд заасны дагуу шүүх хэргийг хянан үзэв.", citationFragment: "12", note: "Dotted article citation." },
  { text: "Иргэний хэрэг 5.1.2-т заасан журмаар хянагдана.", citationFragment: "5", note: "Dotted sub-clause citation." },
  { text: "Прокурорын дүгнэлт 2024 оны 3 дугаар сарын 15-нд гарсан.", citationFragment: "2024", note: "Date inside legal prose." },
];

// ---------------------------------------------------------------------
// 9. NUMERIC_TOKENS — bare numbers and docket-style numbers.
// ---------------------------------------------------------------------
export type NumericTokenCase = { text: string; numericFragment: string; note: string };

export const NUMERIC_TOKENS: readonly NumericTokenCase[] = [
  { text: "Иргэний хэрэг No.2024-0456 дугаартай хэрэгт холбогдох тогтоол гарлаа.", numericFragment: "2024", note: "Case docket number." },
  { text: "Тэрээр 3 удаа шүүхэд ирсэн.", numericFragment: "3", note: "A bare count." },
];

// ---------------------------------------------------------------------
// 10. OCR_GARBAGE — real and synthetic corrupted tokens.
// ---------------------------------------------------------------------
export type OcrGarbageCase = { token: string; note: string };

export const OCR_GARBAGE: readonly OcrGarbageCase[] = [
  {
    token: "зхшхштх",
    note:
      "Real-world corrupted/abbreviated token, not fabricated: src/engine/knowledge/discovery/identify-priority-laws.ts matches it (alongside 'зхштх' " +
      "and 'zxshth') as a known OCR/shorthand rendering of 'захиргааны хэрэг шийдвэрлэх тухай хууль' (the Administrative Case Procedure Act) in law titles.",
  },
  { token: "vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv", note: "Synthetic repeated-character OCR pattern." },
  { token: "aбвгд", note: "Mixed Latin 'a' + Cyrillic tail — a common OCR/keyboard-layout confusion artifact (Latin 'a' U+0061 looks identical to Cyrillic 'а' U+0430)." },
];

// ---------------------------------------------------------------------
// 11. MORPHOLOGY_BOUNDARY_CASES — suffix-boundary adversarial cases.
// ---------------------------------------------------------------------
export type MorphologyBoundaryCase = { word: string; expectedKnown: boolean; note: string };

export const MORPHOLOGY_BOUNDARY_CASES: readonly MorphologyBoundaryCase[] = [
  { word: "хэрэгг", expectedKnown: false, note: "Identical final consonant + single-letter suffix (г+г) — must never geminate into a 'known' word (f8831e2 fix)." },
  { word: "хаалттай", expectedKnown: true, note: "Identical final consonant + MULTI-letter suffix (т+тай) — genuinely doubles, and is genuinely correct; must NOT be caught by the geminate guard (the guard is scoped to length-1 suffixes only)." },
  { word: "ажилтай", expectedKnown: true, note: "Non-identical consonant (л) + comitative suffix, correct vowel-harmony variant (masculine тай, matching ажил's masculine class)." },
  {
    word: "ажилээс",
    expectedKnown: true,
    note:
      "Non-identical consonant + WRONG-harmony suffix variant (feminine ээс on masculine ажил; the correct ablative is the elided ажлаас). " +
      "This milestone's harmony fix removed it from COMPLETE_WORDS pre-generation (verified: it is no longer a reachable SUGGESTION target), " +
      "but isKnownMongolianWord still returns true for it because matchesMorphology()'s generic runtime suffix-stripping independently re-derives " +
      "'known' for ANY word ending in a registered suffix whose stripped stem is a registered STEM, regardless of harmony correctness. " +
      "This is a deliberately deferred, SAFE-DIRECTION-ONLY limitation (silent non-flagging of a rare misspelling, never a wrong suggestion) — " +
      "documented, not silently dropped. Asserted here as expectedKnown=true so this test tracks reality and fails loudly if a future change " +
      "makes this word suddenly become a live suggestion target instead of merely silently-accepted.",
  },
  { word: "заалтуудыг", expectedKnown: true, note: "Suffix chain: plural (-ууд) + accusative (-ыг) on заалт." },
  { word: "хуульчид", expectedKnown: true, note: "Must recognize via the longest suffix (-ид), not the coincidentally-earlier bare '-д'." },
];

/** Named regressions for the two specific bugs the task asked to
 * re-verify by name. */
export const MORPHOLOGY_REGRESSION_NAMES = {
  huulchidMustNotDeriveHuulchi: "хуульчид MUST NOT derive the stem хуульчи (bare '-д' instead of '-ид')",
  geMustNotBeTrustedStem: "гэ MUST NOT become a trusted morphological stem",
} as const;

// ---------------------------------------------------------------------
// 12. UNKNOWN_WORDS — genuinely absent words that must stay silent (no
//     suggestion), distinct from VALID_WORDS (which ARE known).
// ---------------------------------------------------------------------
export type UnknownWordCase = { word: string; note: string };

export const UNKNOWN_WORDS: readonly UnknownWordCase[] = [
  { word: "захирамж", note: "'decree/order' — genuinely absent from both the dictionary and the 59-document evaluation corpus; must stay silent, not guessed." },
  { word: "яллагдагч", note: "'defendant/accused' — same." },
  { word: "сэжигтэн", note: "'suspect' — same." },
  { word: "жиппоюкс", note: "Nonsense string, no real dictionary neighbor at all." },
];
