/**
 * Maps the three legacy gold sets into one classified list for the V1 engine.
 *
 * Classes: VALID, MISSPELLING, UNKNOWN, PROPER_NOUN, ABBREVIATION, LEGAL,
 * REGRESSION. The legacy sets encode the OLD engine's behaviour as well as
 * linguistic truth; every place where V1 intentionally expects something
 * different is listed in `EXPECTATION_CHANGES` with the reason.
 */
import {
  ABBREVIATION_RANKING_CASES,
  CURATED_TYPO_MAP_CASES,
  DANGEROUS_NEAR_NEIGHBORS,
  MORPHOLOGY_BOUNDARY_CASES,
  PROPER_NOUN_RANKING_CASES,
  TYPO_CORRECTIONS as ADV_TYPOS,
  UNKNOWN_WORDS,
  VALID_INFLECTED_FORMS,
  VALID_LEGAL_TERMS,
  VALID_WORDS as ADV_VALID,
} from "../adversarial-gold-set";
import {
  ABBREVIATION_CASES,
  DANGEROUS_CONFUSION_SET,
  LEGAL_TERM_SET,
  MORPHOLOGY_SET,
  PROPER_NOUN_CASES,
  RARE_WORD_CASES,
  SPELLCHECK_GOLD_SET_TYPOS,
  SPELLCHECK_GOLD_SET_VALID,
  ORDINARY_WORDS_IN_LEGAL_TEXT,
} from "../mongolian-legal-gold-set";
import {
  NEW_DANGEROUS_NEAR_NEIGHBORS,
  TYPO_CORRECTIONS as V2_TYPOS,
  VALID_WORDS as V2_VALID,
} from "../orthography-v2-gold-set";

export type GoldClass =
  | "VALID"
  | "MISSPELLING"
  | "UNKNOWN"
  | "PROPER_NOUN"
  | "ABBREVIATION"
  | "LEGAL"
  | "REGRESSION";

export type GoldCase = {
  cls: GoldClass;
  input: string;
  /** Present for MISSPELLING: the intended correction. */
  expected?: string;
  /** Which legacy set it came from. */
  source: string;
};

export const EXPECTATION_CHANGES: ReadonlyArray<{ input: string; was: string; now: string; reason: string }> = [
  {
    input: "хэрэгг",
    was: "expectedKnown=false (adversarial MORPHOLOGY_BOUNDARY_CASES)",
    now: "MISSPELLED / DOUBLED_FINAL_LETTER → хэрэг",
    reason: "Same expectation (not a word); V1 additionally proposes a verified correction. Excluded from the REGRESSION 'silent' class.",
  },
  {
    input: "ажилээс",
    was: "expectedKnown=true (a documented legacy LIMITATION, not linguistic truth)",
    now: "still VALID (deliberately lenient), listed in LANGUAGE_ENGINE_V1.md → Limitations",
    reason: "ажил is masculine, so «-ээс» is wrong, but its last vowel «и» puts the stem in the MIXED-harmony class where V1 never claims a harmony error (precision over recall). Not flagged, never suggested.",
  },
  {
    input: "ширэх, зорчил, хэрг, марган, маргаш, надэд, хииж, шиидвэр (legacy MISSPELLING set)",
    was: "corrected by fuzzy matching against the legacy dictionary (17/17)",
    now: "corrected only where a deterministic rule fires; otherwise UNKNOWN (abstain)",
    reason: "The SEED lexicon (~570 words) cannot prove a word is absent, so edit-distance DETECTION is disabled (it produced 134 false positives / 1000 words on clean text in the legacy engine). Recall on these cases is expected to rise only with a BROAD licensed lexicon.",
  },
];

const out: GoldCase[] = [];
const add = (cls: GoldClass, input: string, source: string, expected?: string) =>
  out.push({ cls, input, source, ...(expected ? { expected } : {}) });

for (const c of ADV_VALID) add("VALID", c.word, "adversarial.VALID_WORDS");
for (const c of VALID_LEGAL_TERMS) add("LEGAL", c.word, "adversarial.VALID_LEGAL_TERMS");
for (const c of VALID_INFLECTED_FORMS) add("VALID", c.word, "adversarial.VALID_INFLECTED_FORMS");
for (const c of SPELLCHECK_GOLD_SET_VALID) add("VALID", c.word, "legal.VALID");
for (const c of V2_VALID) add("VALID", c.word, "v2.VALID_WORDS");
for (const c of MORPHOLOGY_SET) add("VALID", c.word, "legal.MORPHOLOGY_SET");
for (const c of ORDINARY_WORDS_IN_LEGAL_TEXT) add("VALID", c.word, "legal.ORDINARY_WORDS");
for (const c of ADV_TYPOS) add("MISSPELLING", c.input, "adversarial.TYPO_CORRECTIONS", c.expectedCandidate);
for (const c of CURATED_TYPO_MAP_CASES) add("MISSPELLING", c.input, "adversarial.CURATED", c.expectedCandidate);
for (const c of SPELLCHECK_GOLD_SET_TYPOS) add("MISSPELLING", c.input, "legal.TYPOS", c.expectedTop);
for (const c of V2_TYPOS) add("MISSPELLING", c.input, "v2.TYPO_CORRECTIONS", c.expectedCorrection);
for (const c of UNKNOWN_WORDS) add("UNKNOWN", c.word, "adversarial.UNKNOWN_WORDS");
for (const c of RARE_WORD_CASES) add("UNKNOWN", c.word, "legal.RARE_WORDS");
for (const c of PROPER_NOUN_RANKING_CASES) add("PROPER_NOUN", c.word, "adversarial.PROPER_NOUN");
for (const c of PROPER_NOUN_CASES) add("PROPER_NOUN", c.word, "legal.PROPER_NOUN");
for (const c of ABBREVIATION_RANKING_CASES) add("ABBREVIATION", c.word, "adversarial.ABBREVIATION");
for (const c of ABBREVIATION_CASES) add("ABBREVIATION", c.word, "legal.ABBREVIATION");
for (const c of LEGAL_TERM_SET) add("LEGAL", c.word, "legal.LEGAL_TERM_SET");
for (const c of MORPHOLOGY_BOUNDARY_CASES) {
  if (c.word === "хэрэгг") continue; // see EXPECTATION_CHANGES
  add("REGRESSION", c.word, "adversarial.MORPHOLOGY_BOUNDARY");
}

export const GOLD_CASES: readonly GoldCase[] = out.filter((c) => c.input.length > 0);

export const DANGEROUS_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...DANGEROUS_NEAR_NEIGHBORS.map((p) => [p.wordA, p.wordB] as const),
  ...NEW_DANGEROUS_NEAR_NEIGHBORS.map((p) => [p.wordA, p.wordB] as const),
  ...DANGEROUS_CONFUSION_SET.map((p) => [p.valid, p.nearby] as const),
];
