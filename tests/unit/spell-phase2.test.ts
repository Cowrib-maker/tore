import { describe, expect, it } from "vitest";
import { createSpellEngineV1, type SpellEngineV1 } from "../../src/spell-engine";
import { evaluateLoans, evaluateNames, loadLoanSet, loadNameSet } from "../evaluation/spell-v1/eval-sets";
import { TrigramModel, ngramKeys } from "../../src/spell-engine/context/trigram";

/**
 * Phase 2 (accuracy & coverage hardening). Every morphology/orthography rule added or tightened in this phase has an ID, positive
 * examples, negative examples (must NOT be VALID), counter-examples (a look-alike that must keep its verdict), and provenance.
 * Rule evidence is QA-only (a local second-opinion dictionary was used to test hypotheses; nothing was copied) and every
 * rule is PENDING_NATIVE_REVIEW.
 */
const engine: SpellEngineV1 = createSpellEngineV1();
const verdict = (w: string): string => engine.analyze(`Энэ ${w} нь`).tokens[1]!.verdict;
const verdictMid = (w: string): string => engine.analyze(`Манай найз ${w} ирлээ`).tokens[2]!.verdict;

type RuleCase = { id: string; provenance: string; positive: string[]; negative: string[]; counter: { word: string; expect: string }[] };

const RULES: RuleCase[] = [
  {
    id: "R-GEN-LONG-GIIN",
    provenance: "standard grammar: a stem ending in a LONG vowel also takes «гийн»; the oracle accepts it for ~50% of long-vowel nouns (lexical), so both ны/ний and гийн are licensed",
    positive: ["байгаагийн", "хүүгийн", "удаагийн", "дулмаагийн"],
    negative: ["хаалгагийн"], // short final vowel never takes «гийн»
    counter: [{ word: "хаалганы", expect: "VALID" }],
  },
  {
    id: "R-AGENT-CH-PLURAL",
    provenance: "88 of 89 ч-final lexicon nouns have a plural «-чид» (stem -чд- before a case suffix) accepted by the oracle",
    positive: ["зохиолчид", "зохиолчдын", "хэрэглэгчдийн", "сонирхогчдын", "оруулагчдын"],
    negative: ["зохиолчидууд"], // a double plural is never valid (чууд itself is also attested, so it is not asserted either way)
    counter: [{ word: "жүжигчдийн", expect: "VALID" }],
  },
  {
    id: "R-HIDDEN-G (oracle-verified lemma flag)",
    provenance: "noun-flags-suggest.ts: lemma flag inferred only when it explains ≥4 more forms the oracle accepts and makes no more forms valid that it rejects",
    positive: ["үзэсгэлэнгийн", "хүрээлэнгийн", "шуудангаар"],
    negative: ["үзэсгэлэнийн"], // vowel-initial suffix directly after a hidden-г stem
    counter: [{ word: "оронд", expect: "VALID" }],
  },
  {
    id: "R-NOUN-FORM-PROMOTION",
    provenance: "34 genuine lemmas had been filed as non-inflecting forms (төгрөг, ус, гишүүн …); promoted to ordinary nouns in overrides.tsv",
    positive: ["төгрөгийг", "төгрөгт", "усны", "гишүүний", "эцгийн"],
    negative: [],
    counter: [{ word: "төгрөг", expect: "VALID" }],
  },
  {
    id: "R-INVARIANT-GUI",
    provenance: "«-гүй» is invariant: it is no evidence about the stem's vowel harmony, so the vowel-neighbour accusation ignores it",
    positive: ["дамжихгүй", "тусгүй"],
    negative: [],
    counter: [{ word: "надэд", expect: "MISSPELLED" }], // a real harmony break keeps being flagged
  },
  {
    id: "R-DOUBLE-FINAL-LOAN-GUARD",
    provenance: "corpus survey: double final л н м с т ф б п р з к is how loanwords and names are written (тонн, билл, холл, хилл, пресс); only other doubles or a TRIPLE are slips",
    positive: [],
    negative: [],
    counter: [
      { word: "хилл", expect: "UNKNOWN" },
      { word: "холл", expect: "UNKNOWN" },
      { word: "цомогг", expect: "MISSPELLED" },
      { word: "тоннн", expect: "MISSPELLED" },
      { word: "алхх", expect: "MISSPELLED" },
    ],
  },
  {
    id: "R-VERB-FLAG-LOST-FORM-GUARD",
    provenance: "a verb stem flag must not turn a form the oracle accepts (and the unflagged analyzer parses) into a «slip»: дагах+vstem would have made дагсан wrong",
    positive: ["дагсан"],
    negative: [],
    counter: [{ word: "ажилласан", expect: "VALID" }],
  },
  {
    id: "R-GEN-NMLZ-X",
    provenance: "genitive + «х» = «the one of …»: хотынх, багийнхан, оныхоос; corpus-attested (~1% of tokens) and accepted for 41% of lexicon nouns by the oracle; widens VALID only, never accuses",
    positive: ["хотынх", "хотынхон", "багийнхан", "салбарынхан", "төрийнхөн", "оныхоос", "бүтээлийнх"],
    negative: ["хотийнх", "хотынхынхын"], // wrong harmony inside the nominalized stem is never repaired; a second nominalizer is not licensed
    counter: [{ word: "хотын", expect: "VALID" }],
  },
  {
    id: "R-HAB-DAG-NOMINAL + R-PTCP-ELISION",
    provenance: "habitual / past participles are nouns: байдаггүй, байдгийг (vowel elision before a vowel-initial case suffix), болсныг, хийснээр; oracle-attested, widens VALID only",
    positive: ["байдаггүй", "болдоггүй", "хийдэггүй", "байдгийг", "хийдгийн", "болсны", "болсныг", "болсноос", "зурснаар", "унтдагтай"],
    negative: ["байдагийг", "мэддэгний"], // un-elided participle before a vowel-initial / ны-ний case suffix
    counter: [{ word: "хийсэнд", expect: "VALID" }, { word: "байдаг", expect: "VALID" }],
  },
  {
    id: "R-SOFT-I-2LETTER",
    provenance: "a two-letter lemma never grounds a guess unless flagged soft-i (үе → үеийг, үеэс, үеийнхээс)",
    positive: ["үеийг", "үеэс", "үеийнхээс"],
    negative: [],
    counter: [{ word: "үед", expect: "VALID" }],
  },
  {
    id: "R-DT-LONG-VOWEL-GUARD",
    provenance: "productive adjectival «-т» after a long vowel (хүрээт, ширээт): a long vowel + т is never grounds for a д/т accusation",
    positive: [],
    negative: [],
    counter: [{ word: "хүрээт", expect: "UNKNOWN" }],
  },
  {
    id: "R-CVB-N",
    provenance: "«by doing» converb = infinitive minus «х» plus «н» (ашиглах → ашиглан); accepted by the oracle for 100% of 700+ lexicon verbs it knows, in every stem class",
    positive: ["ашиглан", "оруулан", "эхлэн", "дэмжин", "холбон", "бүтээн", "хийн", "тохиолдуулан"],
    negative: ["ашигласан" + "н"], // a participle plus a stray «н» is not a converb
    counter: [{ word: "ашигласан", expect: "VALID" }],
  },
];

describe("phase-2 rules: positive / negative / counter-examples", () => {
  for (const r of RULES) {
    describe(r.id, () => {
      it("records its provenance and stays PENDING native review", () => {
        expect(r.provenance.length).toBeGreaterThan(20);
      });
      for (const w of r.positive) it(`positive «${w}» is VALID`, () => expect(verdict(w)).toBe("VALID"));
      for (const w of r.negative) it(`negative «${w}» is not VALID`, () => expect(verdict(w)).not.toBe("VALID"));
      for (const c of r.counter) it(`counter «${c.word}» stays ${c.expect}`, () => expect(verdict(c.word)).toBe(c.expect));
    });
  }
});

describe("residual real-text false-positive types (investigated 2026-10-07)", () => {
  it("метронд (метро + нд), функцүүдийг (loan, unstable harmony), дамжихгүй, тусгүй are not accused", () => {
    for (const w of ["метронд", "функцүүдийг", "функцуудийг", "дамжихгүй", "тусгүй"]) expect(verdict(w), w).not.toBe("MISSPELLED");
  });
  it("вирус is written with both harmonies in real text (вирусаар / вирусээр / вирустэй / вирусээс): loan flag → neither is accused", () => {
    for (const w of ["вирусаар", "вирусээр", "вирустай", "вирустэй", "вирусаас", "вирусээс"]) expect(verdict(w), w).toBe("VALID");
  });
  it("суурыг (суур «seat» + ыг) is not mistaken for суурийг; хүрээт (productive adjectival -т after a long vowel) is never a д/т slip", () => {
    expect(verdict("суурыг")).toBe("VALID");
    expect(verdict("хүрээт")).not.toBe("MISSPELLED");
  });
});

describe("rival repairs make a competing-hypothesis suggestion AMBIGUOUS, never confident", () => {
  const status = (w: string) => engine.analyze(`Энэ ${w} нь`).issues[0]?.suggestionStatus;
  it("a transposition of a valid form is a rival (хамтрна: хамтарна or хамтран)", () => {
    expect(status("хамтрна")).toBe("AMBIGUOUS");
  });
  it("a vowel-swap lemma rival (гэрын: гэрийн or гарын)", () => {
    expect(status("гэрын")).toBe("AMBIGUOUS");
  });
  it("an unrivalled repair stays CONFIDENT and never auto-applies", () => {
    expect(status("надэд")).toBe("CONFIDENT");
    expect(engine.analyze("Энэ надэд нь").issues[0]!.suggestions.every((s) => s.autoApplySafe === false)).toBe(true);
  });
});

describe("proper-name and loanword evaluation sets (assistant-authored, PENDING_NATIVE_REVIEW — not gold)", () => {
  it("the sets declare their review status", () => {
    expect(loadNameSet().reviewStatus).toBe("PENDING_NATIVE_REVIEW");
    expect(loadLoanSet().reviewStatus).toBe("PENDING_NATIVE_REVIEW");
  });
  it("no proper name or place form is ever MISSPELLED (false accusation rate 0)", () => {
    const r = evaluateNames(engine);
    expect(r.accused).toEqual([]);
    expect(r.forms).toBeGreaterThan(150);
  });
  it("no accepted loanword form is MISSPELLED, in either vowel harmony", () => {
    const r = evaluateLoans(engine);
    expect(r.accused).toEqual([]);
    expect(verdict("клубаас")).not.toBe("MISSPELLED");
    expect(verdict("клубээс")).not.toBe("MISSPELLED");
  });
  it("names are mid-sentence capitalised: a lower-case unknown name is not accused either", () => {
    expect(verdictMid("Болдод")).not.toBe("MISSPELLED");
  });
});

describe("context re-ranking foundation (unigram → bigram → trigram, local counts)", () => {
  const counts = new Map<string, number>([
    ["дуртай", 40], ["дүртэй", 1], ["маш", 90], ["маш дуртай", 12], ["дуртай хүн", 9], ["маш дүртэй", 0], ["хүн", 300],
  ]);
  const model = new TrigramModel((k) => counts.get(k) ?? 0, 10_000, 5_000);
  it("collects exactly the n-gram keys it needs", () => {
    const keys = ngramKeys({ l2: null, l1: "маш", r1: "хүн", r2: null }, "дуртай");
    expect(keys).toContain("маш дуртай");
    expect(keys).toContain("дуртай хүн");
    expect(keys).toContain("маш дуртай хүн");
  });
  it("prefers the candidate the context supports, and is decisive only with margin AND support", () => {
    const r = model.rerank({ l2: null, l1: "маш", r1: "хүн", r2: null }, ["дүртэй", "дуртай"]);
    expect(r.ordered[0]!.text).toBe("дуртай");
    expect(r.decisive).toBe(true);
  });
  it("with no context evidence it does not claim a winner (support 0 → not decisive)", () => {
    const r = model.rerank({ l2: null, l1: "огт", r1: "эрвээхэй", r2: null }, ["дүртэй", "дуртай"]);
    expect(r.decisive).toBe(false);
  });
});
