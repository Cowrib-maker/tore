/**
 * Hand-reviewed evaluation data for the Mongolian Legal Orthography
 * Engine — the "EVALUATION_ONLY" layer.
 *
 * NOTHING in this file is imported by dictionary.ts, suggestions.ts, or
 * corpus-vocabulary.ts. It exists purely to test the engine from the
 * outside, and is intentionally kept out of the runtime dependency graph
 * so an evaluation dataset can never silently become a vocabulary source.
 *
 * Every entry below was written or confirmed by a human reading actual
 * output (this file's own comments cite where each one came from) —
 * nothing here was mechanically dumped from an extraction run and
 * relabeled as truth. Where a candidate came from automated extraction,
 * the comment says so explicitly and describes the manual verification
 * step taken before including it.
 */

export type KnownWordCase = {
  word: string;
  note: string;
};

export type TypoCase = {
  /** The misspelling as a user would type it. */
  input: string;
  /** The correction a human confirms is the intended word. */
  expectedTop: string;
  note: string;
};

export type DangerousConfusionCase = {
  /** A valid word that must never be "corrected". */
  valid: string;
  /** A different, also-valid dictionary word close enough in spelling
   * that a naive matcher could conflate the two. */
  nearby: string;
  note: string;
};

export type MorphologyCase = {
  word: string;
  note: string;
};

export type UnknownSilentCase = {
  /** A word absent from the dictionary that must produce NO suggestion
   * (confidence too low / word genuinely absent) rather than a guess. */
  word: string;
  note: string;
};

export type AbbreviationCase = {
  word: string;
  note: string;
};

export type ArticleNumberCase = {
  /** Raw text containing a citation-style token that must never be
   * treated as a spelling candidate. */
  text: string;
  rejectedToken: string;
  note: string;
};

export type OcrGarbageCase = {
  token: string;
  note: string;
};

/**
 * B/D — valid legal words (including inflected forms) that must remain
 * silent. Sourced from: (a) the standing regressions carried forward from
 * commits 0577f94/f8831e2, and (b) new findings from the 59-document
 * evaluation corpus (tests/fixtures/*.html + src/domain/student/*.ts),
 * each individually re-typed and checked with isKnownMongolianWord before
 * inclusion here — not copy-pasted from a raw extraction dump.
 */
export const SPELLCHECK_GOLD_SET_VALID: readonly KnownWordCase[] = [
  { word: "хаалттай", note: "Standing regression (f8831e2): comitative -тай on a т-final stem, not a geminate typo." },
  { word: "заалттай", note: "Standing regression (0577f94): must not falsely 'correct' хаалттай into this." },
  { word: "хүүхэд", note: "Standing regression (f8831e2): was entirely missing (child)." },
  { word: "миний", note: "Standing regression (f8831e2): was missing and mis-corrected to минь." },
  { word: "эсэх", note: "NEW this milestone: extremely common (whether/or-not) — was unknown and 'corrected' to эсвэл/энэ/эрх in real sentences from the evaluation corpus. Verified by hand: no real Mongolian sentence intends эсвэл/энэ/эрх when эсэх is typed." },
  { word: "тусгаар", note: "NEW this milestone: 'тусгаар тогтносон' (sovereign and independent) is Article 1 of the Constitution fixture (tests/fixtures/legalinfo-367-constitution.html). Was unknown and offered тусгай/дугаар as corrections. Verified against the fixture text directly." },
  { word: "заадаг", note: "NEW this milestone: habitual aspect (-даг) on the already-known stem заа. Confirms the new suffix rule fires, not just the specific word." },
  { word: "хуульчид", note: "Standing regression (f8831e2): -ид plural of хуульч." },
  { word: "явлаа", note: "Standing regression (f8831e2): past-perfective -лаа on the verb stem яв." },
];

/**
 * C — typo -> intended legal word. Confirmed by hand: for each, the
 * "expectedTop" is the word a fluent reader would recognize as intended,
 * verified against suggestDictionaryWords()'s actual output, not assumed.
 */
export const SPELLCHECK_GOLD_SET_TYPOS: readonly TypoCase[] = [
  { input: "ширэх", expectedTop: "ширхэг", note: "Standing regression (0577f94): the original false-positive report — must rank above the unrelated ирэх." },
  { input: "хунэтаи", expectedTop: "хүнтэй", note: "Existing high-confidence typo-map entry, must survive any ranking change." },
  { input: "зорчил", expectedTop: "зөрчил", note: "Missing ө — found via evaluation-corpus probing, single unambiguous same-category vowel substitution." },
  { input: "шиидвэр", expectedTop: "шийдвэр", note: "Doubled и for й — same-category (vowel/vowel) substitution, unambiguous." },
  { input: "хэрг", expectedTop: "хэрэг", note: "Elided vowel — must not be confused with the unrelated хэрэв (see DANGEROUS_CONFUSION_SET)." },
];

/**
 * D/I — a valid word close in spelling to another valid word must never
 * be "corrected" into it. Both members of every pair below are
 * confirmed known() === true independently; the risk being tested is a
 * naive edit-distance matcher conflating them.
 */
export const DANGEROUS_CONFUSION_SET: readonly DangerousConfusionCase[] = [
  { valid: "ширхэг", nearby: "ирэх", note: "Original 0577f94 report: distance-1 from ширэх, but semantically unrelated to the intended ширхэг." },
  { valid: "хаалттай", nearby: "заалттай", note: "f8831e2 report: distance 1 apart (х/з), both real, unrelated words." },
  { valid: "хэрэг", nearby: "хэрэв", note: "NEW: 'case/matter' vs 'if' — distance 1 (г/в), both extremely common and both real; found while building the DANGEROUS_CONFUSION_SET by checking near-neighbors of high-frequency legal terms from the evaluation corpus." },
  { valid: "гэрч", nearby: "гэр", note: "'witness' vs 'house/home' — гэрч must never fall back to гэр just because гэр is shorter and shares a prefix." },
  { valid: "эрх", nearby: "эрхтэй", note: "'right' (noun) vs 'has a right' (comitative form) — both valid, must not collapse into each other." },
];

/**
 * E — proper nouns must never produce a generic-word correction, and a
 * generic word must never be misclassified as a name either way. All
 * confirmed against src/domain/mongolian-orthography/corpus-vocabulary.ts
 * output for the 59-document evaluation corpus, read by hand.
 */
export const PROPER_NOUN_CASES: readonly { word: string; note: string }[] = [
  {
    word: "сүхбаатар",
    note: "A real place/person name (Сүхбаатар district) — correctly classified PROPER_NOUN by the extraction pipeline when it appears mid-sentence. Regression for tests/unit/corpus-vocabulary-extraction.test.ts.",
  },
  {
    word: "батбаяр",
    note: "A real person name from the fixture corpus, but only ever appears after an initial ('Ө.Батбаяр') — the pipeline's sentence-boundary heuristic treats that as inconclusive rather than proper-noun evidence, so it's held back as insufficient_evidence rather than merged either as a name or a common word. Documented limitation, safe direction (never merged).",
  },
];

/**
 * F — abbreviations must never be silently expanded or merged as if they
 * were ordinary words. Found in the evaluation corpus (НҮБ, УБ, УИХ all
 * appear once each) and confirmed classified ABBREVIATION, never
 * COMMON/LEGAL, by the pipeline.
 */
export const ABBREVIATION_CASES: readonly AbbreviationCase[] = [
  { word: "НҮБ", note: "United Nations — all-caps, 3 letters, classified ABBREVIATION, excluded from selectSafeDictionaryEntries() regardless of frequency." },
  { word: "УИХ", note: "State Great Khural (parliament) — same pattern." },
];

/**
 * G — article/clause/case numbers must be rejected outright, never
 * treated as a token to spellcheck.
 */
export const ARTICLE_NUMBER_CASES: readonly ArticleNumberCase[] = [
  { text: "Эрүүгийн хуулийн 2.1 дугаар зүйлд заасны дагуу", rejectedToken: "2", note: "Digit-bearing fragment of a dotted article citation — never a candidate." },
  { text: "иргэний хэрэг No.2024-0456 дугаартай", rejectedToken: "2024", note: "Case docket number." },
];

/**
 * H — OCR-garbage / corrupted tokens must be rejected. "зхшхштх" is a
 * REAL token found in src/domain/student/administrative.ts's quiz
 * options (a deliberately meaningless multiple-choice distractor) — not
 * a fabricated example.
 */
export const OCR_GARBAGE_CASES: readonly OcrGarbageCase[] = [
  { token: "зхшхштх", note: "Real token from a quiz distractor option (administrative.ts). Composed of valid Cyrillic letters but not a real Mongolian word — currently only caught because it's a single-document, low-frequency token (insufficient_evidence), not by a dedicated 'looks like real Mongolian' check. Documented limitation: a nonsense string repeated across many documents would not be caught by digit/script/length filters alone." },
  { token: "vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv", note: "Synthetic OCR-repeat-garbage pattern, rejected via length_out_of_range (>24 chars)." },
];

/**
 * B (part 2) — legal-domain morphology: inflected/suffixed forms of
 * known legal stems that must be recognized, not flagged.
 */
export const MORPHOLOGY_SET: readonly MorphologyCase[] = [
  { word: "хэргийг", note: "Accusative + elided vowel on хэрэг." },
  { word: "заалтуудыг", note: "Plural + accusative on заалт." },
  { word: "хуульчаар", note: "Instrumental on хуульч." },
  { word: "шүүгчид", note: "-ид plural on шүүгч." },
  { word: "явтал", note: "'until' converb on the verb stem яв." },
];

/**
 * A/D — high-value legal terminology from the task's own example list.
 * `alreadyKnown` reflects the CURRENT hand-curated dictionary (unchanged
 * by this milestone). Terms marked `foundInCorpus: false` are genuinely
 * absent from both tests/fixtures/*.html and src/domain/student/*.ts —
 * i.e. this evaluation corpus provides no frequency evidence for them
 * one way or the other, so they are NOT added here on intuition alone.
 */
export const LEGAL_TERM_SET: readonly {
  word: string;
  alreadyKnown: boolean;
  foundInCorpus: boolean;
  note: string;
}[] = [
  { word: "зүйл", alreadyKnown: true, foundInCorpus: true, note: "occ=25, docFreq=15/59 in the evaluation corpus." },
  { word: "хэсэг", alreadyKnown: true, foundInCorpus: false, note: "Already known; not independently attested in this corpus." },
  { word: "заалт", alreadyKnown: true, foundInCorpus: true, note: "occ=3, docFreq=3/59." },
  { word: "тогтоол", alreadyKnown: true, foundInCorpus: false, note: "Already known; not independently attested in this corpus." },
  { word: "захирамж", alreadyKnown: false, foundInCorpus: false, note: "GAP: genuinely missing from the dictionary AND absent from this evaluation corpus. Cannot be added on corpus evidence; would need a larger authoritative corpus or a cited external lexicon." },
  { word: "шийдвэр", alreadyKnown: true, foundInCorpus: true, note: "occ=12, docFreq=8/59." },
  { word: "нэхэмжлэл", alreadyKnown: true, foundInCorpus: true, note: "occ=7, docFreq=6/59." },
  { word: "яллагдагч", alreadyKnown: false, foundInCorpus: false, note: "GAP: same as захирамж — missing and unattested here." },
  { word: "хохирогч", alreadyKnown: true, foundInCorpus: true, note: "Already known; one corpus occurrence was mis-tagged PROPER_NOUN by the sentence-position heuristic (same class of imprecision as батбаяр above) — harmless since alreadyKnown already gates it out of any merge." },
  { word: "сэжигтэн", alreadyKnown: false, foundInCorpus: false, note: "GAP: same as захирамж/яллагдагч." },
  { word: "мөрдөн", alreadyKnown: true, foundInCorpus: false, note: "Already known (stem); not independently attested in this corpus." },
  { word: "прокурор", alreadyKnown: true, foundInCorpus: false, note: "Already known; not independently attested in this corpus." },
  { word: "өмгөөлөгч", alreadyKnown: true, foundInCorpus: false, note: "Already known; not independently attested in this corpus." },
  { word: "шүүх", alreadyKnown: true, foundInCorpus: true, note: "occ=4, docFreq=4/59." },
  { word: "хэрэг", alreadyKnown: true, foundInCorpus: true, note: "occ=11, docFreq=6/59." },
  { word: "нотлох", alreadyKnown: true, foundInCorpus: false, note: "Already known; the corpus's single occurrence was below the document-frequency floor (insufficient_evidence), which is fine since it's already known regardless." },
  { word: "баримт", alreadyKnown: true, foundInCorpus: true, note: "occ=20 (plus a further 22 via inflected forms folded into a MORPHOLOGICAL_STEM candidate), docFreq=13/59." },
  { word: "гэмт", alreadyKnown: true, foundInCorpus: true, note: "occ=23, docFreq=9/59." },
  { word: "эрх", alreadyKnown: true, foundInCorpus: true, note: "occ=78, docFreq=27/59 — the single most frequent legal-domain word in this corpus." },
  { word: "үүрэг", alreadyKnown: true, foundInCorpus: true, note: "occ=10, docFreq=7/59." },
];

/**
 * A confirmed-dangerous MORPHOLOGICAL_STEM false positive, kept here as a
 * named regression case: the extraction pipeline can conflate
 * etymologically unrelated words that merely end in the same
 * single-letter case suffix. "гэ" aggregates гэж/гэх (the quotative verb
 * "to say/call") with гэм (guilt — a completely different root) purely
 * because "м" is also a listed case-suffix letter. This is exactly the
 * kind of candidate a human reviewer must catch — it clears every
 * numeric threshold (occ=78, docFreq=31/59) comfortably.
 */
export const DANGEROUS_MORPHOLOGICAL_STEM_FALSE_POSITIVE = {
  stem: "гэ",
  wronglyMergedForms: ["гэж", "гэм", "гэх"],
  note: "гэм (guilt) is unrelated to гэж/гэх (quotative 'to say'); never approve this stem into generated/legal-vocabulary.json.",
} as const;
