import { describe, expect, it } from "vitest";
import { BUNDLED_PACKS, Lexicon, MorphAnalyzer, createSpellEngineV1, type DataPack } from "@/spell-engine";
import { hiddenVowelFor } from "@/spell-engine/morphology/analyzer";
import { stemConditionHolds } from "@/spell-engine/morphology/suffixes";
import { runVerbGold } from "../evaluation/spell-v1/run-benchmark";

function packOf(entries: DataPack["entries"]): DataPack {
  return {
    schema: "tore-spell-pack/1",
    id: "t",
    version: "1",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "test", license: "test", redistributable: true },
    entries,
  } as DataPack;
}
const verbs = (...items: [string, string[]?][]) => packOf(items.map(([w, flags]) => ({ w, pos: "V" as const, flags })));
const engineOf = (...items: [string, string[]?][]) => createSpellEngineV1({ packs: [verbs(...items)], typoPairs: [] });
const analyzerOf = (...items: [string, string[]?][]) => new MorphAnalyzer(new Lexicon([verbs(...items)]));
const verdict = (e: ReturnType<typeof engineOf>, w: string) => e.checkWord(w).verdict;

describe("VERB_GOLD_DRAFT_V1 (TORE-authored AI draft, native review pending)", () => {
  const g = runVerbGold();
  it("meets the contract of every expected-kind", () => {
    expect(g.failures).toEqual([]);
    expect(g.acceptance).toBeGreaterThanOrEqual(0.98);
    expect(g.falseMisspelled).toBe(0);
    expect(g.invalidAsValid).toEqual([]);
    expect(g.records).toBeGreaterThan(1500);
  });
  it("covers every supported suffix group", () => {
    for (const tag of ["PRF_V", "PTCP_NEG", "PTCP_PAST_PRIV", "CVB_LGUI", "CVB_NGAA", "CVB_MAGC", "CVB_SAAR", "OPT_AASAI", "HORT_YA", "IMP_AARAI", "IMP_AACH", "IMP_CHIH", "IMP_TSGAA", "IMP_BARE", "CVB_J", "CVB_BARE", "PRS_NA"]) {
      expect(g.byTag[tag]?.n, tag).toBeGreaterThan(5);
      expect(g.byTag[tag]!.ok, tag).toBe(g.byTag[tag]!.n);
    }
  });
});

describe("verb stem classes", () => {
  it("BASE: consonant-final stem + linking vowel", () => {
    const e = engineOf(["зурах"], ["ирэх"], ["бичих"]);
    for (const w of ["зурав", "зурсан", "зуралгүй", "зуръя", "зурцгаа", "ирэв", "ирээгүй", "бичив", "бичилгүй", "бичицгээ", "бичингээ"]) {
      expect(verdict(e, w), w).toBe("VALID");
    }
  });
  it("the linking vowel is the lemma's own: no foreign linking vowel is accepted", () => {
    const e = engineOf(["зурах"], ["ирэх"]);
    for (const w of ["зурэв", "зурив", "ираав", "ирав", "зурэлгүй", "зурсэн"]) expect(verdict(e, w), w).not.toBe("VALID");
  });
  it("consonant-initial suffixes attach directly to a plain consonant stem", () => {
    const e = engineOf(["зурах"]);
    expect(verdict(e, "зурасан")).not.toBe("VALID");
    expect(verdict(e, "зурадаг")).not.toBe("VALID");
    expect(verdict(e, "зуралаа")).not.toBe("VALID");
  });
  it("VOWEL_STEM (flag vstem): ажилласан, never ажиллсан", () => {
    const e = engineOf(["ажиллах", ["vstem"]]);
    for (const w of ["ажилласан", "ажилладаг", "ажиллалаа", "ажиллаад", "ажиллав", "ажиллалгүй", "ажиллая", "ажилламаар", "ажиллацгаа"]) {
      expect(verdict(e, w), w).toBe("VALID");
    }
    expect(verdict(e, "ажиллсан")).toBe("MISSPELLED");
    expect(e.checkWord("ажиллсан").reasonCode).toBe("STEM_VOWEL_MISSING");
    expect(e.checkWord("ажиллсан").issue?.suggestions[0]?.text).toBe("ажилласан");
  });
  it("without the flag the class is NOT guessed: both spellings are UNKNOWN (M1.1: ажиллсан used to be VALID)", () => {
    const e = engineOf(["ажиллах"]);
    expect(verdict(e, "ажилласан")).toBe("UNKNOWN");
    expect(verdict(e, "ажиллсан")).toBe("UNKNOWN");
    expect(verdict(e, "ажиллав")).toBe("VALID"); // vowel-initial suffixes are identical under every class
  });
  it("EPENTHETIC: a hidden vowel appears between C1 ∈ д т ж з с ш ц ч х and C2", () => {
    const e = engineOf(["нотлох"], ["хөхрөх"], ["хамтрах"], ["эхлэх"], ["шинжлэх"]);
    for (const w of ["нотолсон", "нотолно", "нотлоод", "нотлов", "нотолцгоо", "хөхөрсөн", "хөхрөв", "хамтарсан", "хамтрав", "эхэлсэн", "эхлэв", "шинжилсэн", "шинжлэв"]) {
      expect(verdict(e, w), w).toBe("VALID");
    }
    for (const w of ["нотлсон", "хөхрсөн", "хамтрсан", "эхлсэн", "шинжлсэн"]) expect(verdict(e, w), w).not.toBe("VALID");
  });
  it("sonorant-initial clusters take no hidden vowel (сонс-, бөөнд-, сонирх-)", () => {
    const e = engineOf(["сонсох"], ["сонирхох"]);
    expect(verdict(e, "сонсвол")).toBe("VALID");
    expect(verdict(e, "сонсдог")).toBe("VALID");
    expect(verdict(e, "сонирхсон")).toBe("VALID");
    expect(verdict(e, "сонисрхсон")).not.toBe("VALID");
  });
  it("hidden vowel: и after ш/ж/ч, otherwise the stem's harmony; flag hv:<v> overrides and forces", () => {
    expect(hiddenVowelFor("урагшл", new Set())).toBe("и");
    expect(hiddenVowelFor("нэхэмжл", new Set())).toBe("и");
    expect(hiddenVowelFor("нотл", new Set())).toBe("о");
    expect(hiddenVowelFor("тэмтр", new Set())).toBe("э");
    expect(hiddenVowelFor("ухр", new Set())).toBe("а");
    expect(hiddenVowelFor("хөхр", new Set())).toBe("ө");
    expect(hiddenVowelFor("амр", new Set(["hv:а"]))).toBe("а");
    const e = engineOf(["амрах", ["hv:а"]]);
    expect(verdict(e, "амарсан")).toBe("VALID");
    expect(verdict(e, "амрав")).toBe("VALID");
    expect(e.checkWord("амрсан").issue?.suggestions[0]?.text).toBe("амарсан");
  });
  it("NATIVE: vowel / й-final stems", () => {
    const e = engineOf(["хийх"], ["хаах"], ["нээх"]);
    for (const w of ["хийсэн", "хийв", "хийгээд", "хийгээгүй", "хийлгүй", "хийе", "хийцгээ", "хаасан", "хаагаад", "хаая", "нээв", "нээгээрэй", "нээгээч"]) {
      expect(verdict(e, w), w).toBe("VALID");
    }
  });
  it("SOFT-I (барих): барьсан but баривал / барилгүй", () => {
    const e = engineOf(["барих", ["soft-i"]]);
    for (const w of ["барьсан", "барьтал", "барьчих", "барьцгаа", "барья", "барив", "баривал", "барилгүй", "баримаар", "баримагц", "барингаа"]) {
      expect(verdict(e, w), w).toBe("VALID");
    }
    for (const w of ["барсан", "барьвал", "барилсан", "барьлгүй"]) expect(verdict(e, w), w).not.toBe("VALID");
  });
});

describe("new suffix groups", () => {
  const e = engineOf(["авах"], ["өгөх"], ["олох"], ["хэлэх"]);
  it.each([
    ["аваагүй", "PTCP_NEG"], ["өгөөгүй", "PTCP_NEG"], ["авсангүй", "PTCP_PAST"], ["хэлсэнгүй", "PTCP_PAST"],
    ["авав", "PRF_V"], ["өгөв", "PRF_V"], ["авалгүй", "CVB_LGUI"], ["олонгоо", "CVB_NGAA"], ["авмагц", "CVB_MAGC"],
    ["хэлсээр", "CVB_SAAR"], ["аваасай", "OPT_AASAI"], ["олоосой", "OPT_AASAI"], ["авъя", "HORT_YA"], ["олъё", "HORT_YA"],
    ["хэлье", "HORT_YA"], ["аваарай", "IMP_AARAI"], ["аваач", "IMP_AACH"], ["өгөөч", "IMP_AACH"], ["авчих", "IMP_CHIH"],
    ["авцгаа", "IMP_TSGAA"], ["хэлцгээ", "IMP_TSGAA"],
  ])("%s is VALID via %s", (w, tag) => {
    expect(verdict(e, w)).toBe("VALID");
    const parse = new MorphAnalyzer(e.lexicon).analyze(w).parses[0];
    expect(parse?.tags[0]).toBe(tag);
  });
  it("strict labial harmony: the LAST non-neutral stem vowel decides оо/аа", () => {
    const x = engineOf(["оногдуулах"], ["нотлох"]);
    expect(verdict(x, "оногдуулангаа")).toBe("VALID"); // last vowel у
    expect(verdict(x, "оногдуулонгоо")).not.toBe("VALID");
    expect(verdict(x, "нотлонгоо")).toBe("VALID"); // last vowel о
    expect(verdict(x, "нотлангаа")).not.toBe("VALID");
  });
  it("«-х» participle + case and negation chains still work through the noun path", () => {
    for (const w of ["авахыг", "авахад", "авахаас", "авахаар", "авахгүй"]) expect(verdict(e, w), w).toBe("VALID");
  });
  it("wrong-gender variants are MISSPELLED with an exact verified repair", () => {
    expect(e.checkWord("авсэн").issue?.suggestions[0]?.text).toBe("авсан");
    expect(e.checkWord("авангээ").issue?.suggestions[0]?.text).toBe("авангаа");
    expect(e.checkWord("авсэнгүй").issue?.suggestions[0]?.text).toBe("авсангүй");
    expect(e.checkWord("авсэн").reasonCode).toBe("HARMONY_SUFFIX");
  });
  it("stem conditions", () => {
    expect(stemConditionHolds("r-v-l", "зур")).toBe(true);
    expect(stemConditionHolds("r-v-l", "ав")).toBe(true);
    expect(stemConditionHolds("r-v-l", "хэл")).toBe(true);
    expect(stemConditionHolds("r-v-l", "ажилл")).toBe(false);
    expect(stemConditionHolds("not-r-v-l", "унт")).toBe(true);
    expect(stemConditionHolds("r", "ир")).toBe(true);
  });
});

describe("explanations", () => {
  it("a verb parse explains lemma, stem allomorph, linking vowel and suffix chain", () => {
    const a = analyzerOf(["бичих"], ["нотлох"], ["ажиллах", ["vstem"]]);
    const p1 = a.analyze("бичив").parses[0]!;
    expect(p1.analysis).toEqual({ lemma: "бичих", stem: "бич", stemKind: "BASE", linkingVowel: "и", chain: [{ tag: "PRF_V", text: "ив" }] });
    const p2 = a.analyze("нотолсон").parses[0]!.analysis!;
    expect(p2.stem).toBe("нотол");
    expect(p2.stemKind).toBe("EPENTHETIC");
    const p3 = a.analyze("ажилласан").parses[0]!.analysis!;
    expect(p3.stem).toBe("ажилла");
    expect(p3.stemKind).toBe("VOWEL_STEM");
    const p4 = a.analyze("бичсэнийг").parses[0]!.analysis!;
    expect(p4.chain.map((c) => c.tag)).toEqual(["PTCP_PAST", "ACC"]);
  });
});

describe("safety: unknown stays unknown, nonsense never VALID", () => {
  const e = createSpellEngineV1({ packs: [packOf([{ w: "ном", pos: "N" }, { w: "хүн", pos: "N" }, { w: "гэр", pos: "N" }, { w: "бичих", pos: "V" }])], typoPairs: [] });
  it.each(["номл", "хүнр", "гэрм", "номкр", "номжм", "бичкр", "бичжм", "номсан", "гэрлээ", "хүнсэн", "номцгаа"])("%s is not VALID", (w) => {
    expect(verdict(e, w)).not.toBe("VALID");
  });
  it("a verb suffix never makes a NOUN stem valid, and nouns do not borrow verb stems", () => {
    expect(verdict(e, "номсан")).toBe("UNKNOWN");
    expect(verdict(e, "гэрлээ")).toBe("UNKNOWN");
  });
  it("a verb form whose lemma is absent stays UNKNOWN", () => {
    expect(verdict(e, "зурсан")).toBe("UNKNOWN");
    expect(verdict(e, "ажилласан")).toBe("UNKNOWN");
  });
  it("loanword verb stems with mixed harmony are never accused", () => {
    const m = createSpellEngineV1({ packs: [packOf([{ w: "компьютерлэх", pos: "V" }])], typoPairs: [] });
    for (const w of ["компьютерлэсэн", "компьютерлэсан", "компьютерлэв", "компьютерлэнгээ", "компьютерлэнгаа"]) expect(verdict(m, w), w).not.toBe("MISSPELLED");
  });
  it("is deterministic: same input → same analysis and suggestion order", () => {
    const a = createSpellEngineV1();
    const text = "Тэр ажиллсан нотлсон хамтрсан шалгсан гэж хэлсэн. Хууль хэрэгжүүлсэн.";
    const r1 = JSON.stringify(a.analyze(text, { reportUnknown: true }));
    const r2 = JSON.stringify(createSpellEngineV1().analyze(text, { reportUnknown: true }));
    expect(r2).toBe(r1);
  });
});

describe("bundled data: lemma flags are applied", () => {
  const e = createSpellEngineV1();
  it("flagged bundled verbs follow their stem class", () => {
    for (const w of ["ажилласан", "шалгасан", "ойлгосон", "сонгосон", "тоглосон", "дүгнэсэн", "шийдвэрлэсэн", "нотолсон", "хамтарсан", "тусалсан", "мэдэрсэн", "шинжилсэн", "хорьсон", "амарсан"]) {
      expect(verdict(e, w), w).toBe("VALID");
    }
    for (const w of ["ажиллсан", "шалгсан", "нотлсон", "хамтрсан", "амрсан"]) expect(verdict(e, w), w).toBe("MISSPELLED");
  });
  it("bundled verb flags are explicit lexicon data", () => {
    const flagged = BUNDLED_PACKS.flatMap((p) => p.entries).filter((x) => x.pos === "V" && x.flags?.some((f) => f === "vstem" || f.startsWith("hv:") || f === "soft-i"));
    expect(flagged.length).toBeGreaterThanOrEqual(10);
  });
});
