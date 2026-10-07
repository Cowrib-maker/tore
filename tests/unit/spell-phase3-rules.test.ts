import { describe, expect, it } from "vitest";
import { createSpellEngineV1 } from "../../src/spell-engine";

/**
 * Phase 3 rules, each with positive / negative / counter-examples. Evidence = measured against a local second-opinion dictionary over the
 * lexicon's verbs / nouns (QA only, nothing copied) + corpus attestation. ALL rules are PENDING native review.
 */
const engine = createSpellEngineV1();
const verdict = (w: string) => engine.analyze(`Энэ ${w} нь`).tokens[1]!.verdict;

type Rule = { id: string; evidence: string; positive: string[]; negative: string[]; counter: [string, string][] };
const RULES: Rule[] = [
  {
    id: "R-CVB-HDAA", evidence: "«while doing» = future participle -х + дaa/дээ/доо/дөө; oracle accepts for ~80% of 798 verbs; 1,514 news tokens (0.07%)",
    positive: ["хэлэхдээ", "ажиллахдаа", "авахдаа", "хийхдээ", "орохдоо", "бичихдээ"], negative: ["хэлэхдаа" /* wrong harmony */, "хэлэхдээн"],
    counter: [["хэлэхэд", "VALID"], ["хэлэхдаа", "MISSPELLED"]],
  },
  {
    id: "R-AUX-CHIH", evidence: "perfective auxiliary «чих» builds a consonant stem taking ≥90%-attested endings (сан, даг, лаа, жээ, вал, тал, магц, саар, маар …); 3,087 news tokens (0.14%)",
    positive: ["болчихсон", "болчихоод", "орчихсон", "эхэлчихсэн", "явчихсан", "ажиллачихсан", "болчихлоо", "хийчихсэн"], negative: ["ирчихэв", "болчихчих", "болчихаач", "чихсан"],
    counter: [["чих", "VALID" /* «ear»: a real word */], ["хийсэн", "VALID"]],
  },
  {
    id: "R-DERIV-CAUS / R-DERIV-PASS", evidence: "causative (-уул/-үүл) accepted for ~60% and passive (-гд) for ~56% of verbs by the oracle; generated as LOW-confidence verb lemmas (valid, never a repair)",
    positive: ["ажиллуулах", "ажиллуулж", "ажиллагдах"], negative: ["ажиллуулагдуулах", "ажиллагдагдах"],
    counter: [["үзүүлэх", "VALID"]],
  },
  {
    id: "R-PRONOUN-STEMS", evidence: "irregular pronoun stems (бид→бидэн-, тэд→тэдэн-, тэр→түүн-, энэ→үүн-, өөр, өөрсөд) take the regular case + reflexive chain; no ordinary plural",
    positive: ["биднээс", "биднээр", "өөртөө", "өөрсдийгөө", "өөрсдийн", "түүнийгээ", "үүнийгээ"], negative: ["түүнүүд", "бидэнүүд"],
    counter: [["миний", "VALID"]],
  },
  {
    id: "R-ORDINALS", evidence: "rule-generated ordinals 1–99 incl. the glued compounds news writes as one token, plus the adverbial -т (хоёрдугаарт)",
    positive: ["арваннэгдүгээр", "арванхоёрдугаар", "хорьдугаар", "зургаадугаар", "хоёрдугаарт"], negative: [], counter: [["арвахоёрдугаар", "UNKNOWN"], ["хоёдугаар", "UNKNOWN"]],
  },
  {
    id: "R-HIDDEN-G-ACC", evidence: "bare accusative of a hidden-г noun = lemma + г (тайланг, цалинг, үзэсгэлэнг, байшинг); ~700 news tokens; only for lemmas carrying the oracle-verified hidden-g flag",
    positive: ["тайланг", "цалинг", "үзэсгэлэнг", "байшинг"], negative: ["хотг", "хүнг", "тайланнг"], counter: [["тайлан", "VALID"], ["хотыг", "VALID"]],
  },
];

describe("phase-3 rules: positive / negative / counter-examples", () => {
  for (const r of RULES) {
    describe(r.id, () => {
      it("states its evidence", () => expect(r.evidence.length).toBeGreaterThan(30));
      for (const w of r.positive) it(`positive «${w}» is VALID`, () => expect(verdict(w)).toBe("VALID"));
      for (const w of r.negative) it(`negative «${w}» is not VALID`, () => expect(verdict(w)).not.toBe("VALID"));
      for (const [w, v] of r.counter) it(`counter «${w}» stays ${v}`, () => expect(verdict(w)).toBe(v));
    });
  }
});

describe("tier discipline for rule-generated data", () => {
  it("derived verbs / nouns live in a PROVISIONAL pack and are LOW confidence (never a repair)", () => {
    const e = engine.lexicon.lookup("ажиллагдах")[0]!;
    expect(e.packId).toBe("tore-derived-deverbal");
    expect(e.conf).toBe("LOW");
    expect(createSpellEngineV1({ minTier: "TRUSTED" }).analyze("Энэ ажиллагдах нь").tokens[1]!.verdict).not.toBe("VALID");
  });
});
