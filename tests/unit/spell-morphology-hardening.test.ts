import { describe, expect, it } from "vitest";
import { MorphAnalyzer, Lexicon, createSpellEngineV1, type DataPack } from "@/spell-engine";
import { engineForRecord, loadGoldFile, loadNativeReviewed, loadRegression, loadVerbGoldDraft, runRegression, satisfies, validateGold } from "../evaluation/spell-v1/gold-loader";
import { ADJUDICATED_LEGITIMATE, runMutationSuite } from "../evaluation/spell-v1/mutation";

const pack = (entries: DataPack["entries"]): DataPack =>
  ({
    schema: "tore-spell-pack/1",
    id: "t",
    version: "1",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "test", license: "test", redistributable: true },
    entries,
  }) as DataPack;
const V = (w: string, flags?: string[]) => ({ w, pos: "V" as const, flags });
const N = (w: string, flags?: string[]) => ({ w, pos: "N" as const, flags });
const eng = (...entries: DataPack["entries"]) => createSpellEngineV1({ packs: [pack(entries)], typoPairs: [] });
const verdict = (e: ReturnType<typeof eng>, w: string) => e.checkWord(w).verdict;

describe("gold provenance and integrity", () => {
  const { doc, records } = loadVerbGoldDraft();
  it("VERB_GOLD_DRAFT_V1 is honestly labelled: AI draft, no human review", () => {
    expect(doc.dataset).toBe("VERB_GOLD_DRAFT_V1");
    expect(doc.datasetClass).toBe("TORE_AUTHORED");
    expect(doc.defaults.authorKind).toBe("AI_ENGINEERING_DRAFT");
    expect(doc.defaults.reviewStatus).toBe("PENDING_NATIVE_REVIEW");
    expect(records.every((r) => r.reviewStatus === "PENDING_NATIVE_REVIEW" && r.reviewer === null && r.reviewedOn === null)).toBe(true);
    expect(records.some((r) => r.reviewStatus === ("NATIVE_REVIEWED" as string))).toBe(false);
  });
  it("is structurally valid and every record has the traceability fields", () => {
    expect(validateGold(doc, records)).toEqual([]);
    for (const r of records) {
      expect(r.id).toMatch(/^VERB_GOLD_DRAFT_V1-\d{4}$/);
      expect(["VALID", "INVALID", "VALID_UNSUPPORTED", "DERIVATION", "AMBIGUOUS"]).toContain(r.expected);
      expect(r.source).toBe("TORE_AUTHORED");
      expect(r.provenance.length).toBeGreaterThan(20);
      expect(["HIGH", "MEDIUM"]).toContain(r.confidence);
    }
  });
  it("NATIVE_REVIEWED is empty: no human review has happened", () => {
    expect(loadNativeReviewed().records).toEqual([]);
    expect(loadNativeReviewed().doc.note).toMatch(/EMPTY/);
  });
  it("the validator rejects a fabricated review claim", () => {
    const fake = { ...doc, datasetClass: "TORE_AUTHORED" as const };
    const claim = records.slice(0, 2).map((r) => ({ ...r, reviewStatus: "NATIVE_REVIEWED" as const }));
    expect(validateGold(fake, claim).join(" ")).toMatch(/AI-authored draft must not claim NATIVE_REVIEWED/);
    expect(validateGold(doc, claim).join(" ")).toMatch(/needs reviewer and reviewedOn/);
  });
  it("separates inflection from derivation and records valid-but-unsupported forms", () => {
    const kinds = new Set(records.map((r) => r.expected));
    for (const k of ["VALID", "INVALID", "VALID_UNSUPPORTED", "DERIVATION", "AMBIGUOUS"]) expect(kinds.has(k as never), k).toBe(true);
    expect(records.filter((r) => r.expected === "DERIVATION").every((r) => r.scope === "DERIVATION")).toBe(true);
    expect(records.filter((r) => r.expected === "VALID").every((r) => r.scope === "INFLECTION")).toBe(true);
  });
  it("every record meets its expected-kind contract on the engine", () => {
    const failures: string[] = [];
    const cache = new Map<string, ReturnType<typeof engineForRecord>>();
    for (const r of records) {
      const key = `${r.lemma}|${r.flags.join(",")}`;
      const e = cache.get(key) ?? cache.set(key, engineForRecord(r)).get(key)!;
      if (!satisfies(r.expected, e.checkWord(r.surface).verdict)) failures.push(`${r.id} ${r.lemma}:${r.surface} (${r.expected})`);
    }
    expect(failures).toEqual([]);
  });
  it("the regression dataset holds", () => {
    const r = runRegression();
    expect(r.total).toBeGreaterThan(20);
    expect(r.failures).toEqual([]);
    expect(loadRegression().some((c) => c.status === "KNOWN_DEBT")).toBe(true);
  });
  it("loads the other dataset files with the same loader", () => {
    expect(loadGoldFile("native-reviewed-v1.json").doc.datasetClass).toBe("NATIVE_REVIEWED");
  });
});

describe("negative-mutation gate", () => {
  it("no definitely-invalid mutation of a gold form is VALID unless it is a legitimate form", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runMutationSuite({ seed, perEntry: 8 });
      expect(r.mutated, `seed ${seed}`).toBeGreaterThan(5000);
      expect(r.suspects.map((s) => `${s.kind}:${s.original}→${s.mutated}`), `seed ${seed}`).toEqual([]);
      expect(r.wrongRepairs.map((s) => `${s.kind}:${s.original}→${s.mutated}⇒${s.suggestion}`), `seed ${seed}`).toEqual([]);
    }
  });
  it("every adjudication carries a reason class", () => {
    for (const [m, why] of Object.entries(ADJUDICATED_LEGITIMATE)) expect(why, m).toMatch(/^(PARTICIPLE_CASE_CHAIN|VERBAL_NOUN_CASE|OTHER_LEMMA_FORM|CONVERB_N|AUX_CHIH_CHAIN):/);
  });
  it("is deterministic", () => {
    const a = runMutationSuite({ seed: 7, perEntry: 4 });
    const b = runMutationSuite({ seed: 7, perEntry: 4 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("ambiguous sonorant-cluster stems need a lexicon class", () => {
  it("without a flag: consonant-initial forms are UNKNOWN, vowel-initial forms are VALID", () => {
    const e = eng(V("шалгах"), V("гэрлэх"), V("зөвлөх"), V("амрах"), V("сонгох"));
    for (const w of ["шалгсан", "шалгасан", "гэрлсэн", "гэрлэсэн", "зөвлөсөн", "амарсан", "амрсан", "сонгсон", "сонгосон"]) expect(verdict(e, w), w).toBe("UNKNOWN");
    for (const w of ["шалгав", "шалгаад", "гэрлэв", "гэрлээд", "зөвлөв", "амрав", "сонгов", "сонгоод"]) expect(verdict(e, w), w).toBe("VALID");
  });
  it("a flag resolves the class", () => {
    const e = eng(V("шалгах", ["vstem"]), V("амрах", ["hv:а"]), V("урсах", []), V("тэнцэх"));
    expect(verdict(e, "шалгасан")).toBe("VALID");
    expect(verdict(e, "шалгсан")).toBe("MISSPELLED");
    expect(verdict(e, "амарсан")).toBe("VALID");
    expect(verdict(e, "амрсан")).toBe("MISSPELLED");
    // sonorant + obstruent clusters are ordinary codas: no flag needed
    expect(verdict(e, "урссан")).toBe("VALID");
    expect(verdict(e, "тэнцсэн")).toBe("VALID");
  });
  it("«direct» marks a lexical exception", () => {
    const e = eng(V("ямлах", ["direct"]));
    expect(verdict(e, "ямлсан")).toBe("VALID");
  });
  it("й-clusters are not ambiguous (хөндийрөх → хөндийрсөн)", () => {
    expect(verdict(eng(V("хөндийрөх")), "хөндийрсөн")).toBe("VALID");
  });
  it("hidden-vowel default needs an obstruent C1; the repair needs an explicit flag", () => {
    const e = eng(V("нотлох")); // unflagged
    expect(verdict(e, "нотолсон")).toBe("VALID");
    expect(verdict(e, "нотлсон")).toBe("UNKNOWN"); // no claim without a flag
    expect(verdict(eng(V("нотлох", ["hv:о"])), "нотлсон")).toBe("MISSPELLED");
  });
});

describe("converbs: -ж / -ч", () => {
  it("linked -ж after obstruent / cluster stems", () => {
    const e = eng(V("мэдэх"), V("унтах"), V("бичих"), V("үзэх"), V("бодох"), V("хамтрах"), V("ойлгох", ["vstem"]));
    for (const w of ["мэдэж", "унтаж", "бичиж", "үзэж", "бодож", "хамтраж", "ойлгож"]) expect(verdict(e, w), w).toBe("VALID");
    for (const w of ["мэдж", "унтж", "бичж"]) expect(verdict(e, w), w).not.toBe("VALID");
  });
  it("after a single sonorant the converb is bare and LEXICAL: no flag → UNKNOWN, never guessed", () => {
    const e = eng(V("явах"), V("авах"), V("харах"), V("зурах"), V("хэлэх"));
    for (const w of ["явж", "авч", "харж", "зурж", "хэлж", "яваж", "аваж", "хараж", "зураж", "хэлэж"]) expect(verdict(e, w), w).toBe("UNKNOWN");
  });
  it("a flag licenses exactly the lexical form", () => {
    const e = eng(V("явах", ["cvb:ж"]), V("авах", ["cvb:ч"]));
    expect(verdict(e, "явж")).toBe("VALID");
    expect(verdict(e, "авч")).toBe("VALID");
    expect(verdict(e, "явч")).toBe("UNKNOWN");
    expect(verdict(e, "авж")).toBe("UNKNOWN");
    expect(verdict(e, "яваж")).toBe("UNKNOWN");
    expect(verdict(e, "аваж")).toBe("UNKNOWN");
  });
  it("never MISSPELLED: the bare/linked choice is not an established error", () => {
    const e = eng(V("явах", ["cvb:ж"]));
    expect(verdict(e, "яваж")).not.toBe("MISSPELLED");
  });
});

describe("tense / mood conditions", () => {
  const e = eng(V("зурах"), V("ирэх"), V("унтах"), V("танилцах"), V("унших"), V("бичих"), V("авах"), V("засах"), V("бодох"));
  it("present «-на»: direct after р л м в г ч с з, linked after т ц ш, otherwise not established", () => {
    for (const w of ["зурна", "ирнэ", "авна", "засна", "бичнэ", "унтана", "танилцана", "уншина"]) expect(verdict(e, w), w).toBe("VALID");
    for (const w of ["зурина", "унтна", "танилцна", "уншна", "унтина", "бичина", "бодно"]) expect(verdict(e, w), w).not.toBe("VALID");
  });
  it("conditional «-вал» is not written after в (аввал / яввал)", () => {
    expect(verdict(e, "аввал")).not.toBe("VALID");
    expect(verdict(e, "зурвал")).toBe("VALID");
  });
  it("«-цгаа»: direct after р в л, linked after д т н ц ч ш ж; other finals not established", () => {
    for (const w of ["зурцгаа", "авцгаа", "унтацгаа", "танилцацгаа", "бичицгээ", "уншицгаа"]) expect(verdict(e, w), w).toBe("VALID");
    for (const w of ["зураацгаа", "унтцгаа", "засацгаа", "өгөцгөө"]) expect(verdict(e, w), w).not.toBe("VALID");
  });
  it("bare stem is the 2nd-person imperative", () => {
    for (const w of ["зур", "ав", "бич", "унт", "зас"]) expect(verdict(e, w), w).toBe("VALID");
    expect(new MorphAnalyzer(e.lexicon).analyze("зур").parses[0]?.tags).toEqual(["IMP_BARE"]);
  });
  it("short vowel-final stems never take the г-linked endings (ажиллагаад)", () => {
    const x = eng(V("ажиллах", ["vstem"]), V("хийх"), V("хаах"));
    for (const w of ["ажиллагаад", "ажиллагаагүй", "ажиллагаасай", "ажиллагаарай"]) expect(verdict(x, w), w).not.toBe("VALID");
    for (const w of ["ажиллаад", "ажиллаагүй", "хийгээд", "хийгээгүй", "хаагаад"]) expect(verdict(x, w), w).toBe("VALID");
  });
});

describe("harmony", () => {
  it("the neutral linking vowel и does not make a back stem «mixed» (унших, барих, хорих)", () => {
    const e = eng(V("унших"), V("барих", ["soft-i"]), V("хорих", ["soft-i"]));
    expect(verdict(e, "уншсан")).toBe("VALID");
    expect(verdict(e, "уншсэн")).toBe("MISSPELLED");
    expect(e.checkWord("уншсэн").issue?.suggestions[0]?.text).toBe("уншсан");
    expect(verdict(e, "барьсэн")).not.toBe("VALID");
  });
  it("front stems with only и stay front (бичих, хийх)", () => {
    const e = eng(V("бичих"), V("хийх"));
    expect(verdict(e, "бичсан")).not.toBe("VALID");
    expect(verdict(e, "хийсан")).not.toBe("VALID");
    expect(verdict(e, "бичсэн")).toBe("VALID");
  });
  it("loanword verbs flagged harmony:F follow the flag; unflagged mixed stems are never accused", () => {
    const m = eng(V("компьютерлэх"));
    for (const w of ["компьютерлэв", "компьютерлэв"]) expect(verdict(m, w), w).not.toBe("MISSPELLED");
    const f = eng(V("мэйллэх", ["harmony:F"]));
    expect(verdict(f, "мэйллэв")).not.toBe("MISSPELLED");
  });
  it("strict labial harmony reads the LAST non-neutral stem vowel", () => {
    const e = eng(V("олох"), V("оногдуулах"), V("хөндийрөх"));
    expect(verdict(e, "олсон")).toBe("VALID");
    expect(verdict(e, "олсан")).toBe("UNKNOWN");
    expect(verdict(e, "оногдуулсан")).toBe("VALID");
    expect(verdict(e, "оногдуулсон")).toBe("UNKNOWN");
    expect(verdict(e, "хөндийрсөн")).toBe("VALID"); // и is transparent
  });
});

describe("inflection vs derivation policy", () => {
  it("causative / derived stems are neither VALID nor MISSPELLED in M1", () => {
    const e = eng(V("зурах"), V("хийх"), V("ажиллах", ["vstem"]), V("бичих"), V("ирэх"));
    for (const w of ["зуруул", "зуруулсан", "хийлгэх", "хийлгэсэн", "ажиллуул", "ажиллуулсан", "бичүүл", "ирүүл", "ирүүлсэн"]) {
      expect(verdict(e, w), w).toBe("UNKNOWN");
    }
  });
  it("a derived stem written wrongly is not accused either", () => {
    const e = eng(V("зурах"));
    expect(verdict(e, "зуруулсэн")).toBe("UNKNOWN");
  });
});

describe("legacy leniency register (explicit, so it cannot drift silently)", () => {
  it("KNOWN_DEBT: masculine stems whose last vowel is и stay MIXED: ажилээс is accepted, never flagged", () => {
    const e = eng(N("ажил"));
    expect(verdict(e, "ажилээс")).toBe("VALID");
    expect(verdict(e, "ажлаас")).toBe("VALID");
  });
  it("KNOWN_DEBT: noun case chains keep round leniency (номтай / номтой; also after participles)", () => {
    expect(verdict(eng(N("ном")), "номтай")).toBe("VALID");
    expect(verdict(eng(V("бодох")), "бодсонаар")).toBe("VALID");
  });
  it("FIXED: elision needs a stem of 4+ letters; хтын is not a form of хот", () => {
    const e = eng(N("хот"), N("ажил"), N("хэрэг"), N("ном"));
    expect(verdict(e, "хтын")).not.toBe("VALID");
    expect(verdict(e, "нмын")).not.toBe("VALID");
    for (const w of ["ажлын", "хэргийн", "хотын", "номын"]) expect(verdict(e, w), w).toBe("VALID");
  });
  it("FIXED: к-final loanwords take the i-form (банкийн) and bare «-д» is not written after х", () => {
    const e = eng(N("банк"), V("хариулах"));
    expect(verdict(e, "банкийн")).toBe("VALID");
    expect(verdict(e, "банкийг")).toBe("VALID");
    expect(verdict(e, "хариулахад")).toBe("VALID");
    expect(verdict(e, "хариулахд")).toBe("UNKNOWN");
  });
});

describe("protected tokens are not turned into verbs", () => {
  const e = createSpellEngineV1();
  it.each(["НҮБсан", "ТОРЕлсон", "TOREсан", "ISO-9001-ын", "https://tore.mn/авсан", "info@tore.mn", "2026сан", "№12-ыг", "Тогтохсон"])("%s", (t) => {
    const r = e.analyze(`Энэ ${t} байна.`);
    expect(r.issues.filter((i) => i.verdict === "MISSPELLED")).toEqual([]);
  });
  it("a verb suffix glued to an acronym is not VALID by morphology", () => {
    const a = e.analyze("НҮБсан");
    expect(a.tokens[0]?.reasonCode).not.toBe("MORPHOLOGY");
  });
});

describe("determinism and performance sanity", () => {
  it("same input, same engine data → identical analysis", () => {
    const text = "Тэр ажиллсан нотлосон хамтрах шалгасан хорьсон баривал өгч явж.";
    expect(JSON.stringify(createSpellEngineV1().analyze(text, { reportUnknown: true }))).toBe(JSON.stringify(createSpellEngineV1().analyze(text, { reportUnknown: true })));
  });
  const LET = [..."бвгджзклмнпрстфхцчшй"];
  it("lexicon of many verbs still answers a word in well under 5 ms", () => {
    const verbs = Array.from({ length: 2000 }, (_, i) => V(`зур${LET[i % LET.length]}${LET[Math.floor(i / LET.length) % LET.length]}${LET[Math.floor(i / (LET.length * LET.length)) % LET.length]}ах`));
    const e = createSpellEngineV1({ packs: [pack(verbs)], typoPairs: [] });
    const t0 = performance.now();
    for (let i = 0; i < 200; i += 1) e.checkWord(`зурабасан${i}`);
    expect((performance.now() - t0) / 200).toBeLessThan(5);
    expect(new Lexicon([pack(verbs)]).size).toBe(2000);
  });
});
