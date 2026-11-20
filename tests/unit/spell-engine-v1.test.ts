import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_PACKS,
  Lexicon,
  MorphAnalyzer,
  PackValidationError,
  UserDictionary,
  createSpellEngineV1,
  lex,
  validatePack,
  type DataPack,
} from "@/spell-engine";
import { DeleteIndex, damerauDistance } from "@/spell-engine/candidates/delete-index";
import { fBeta, injectError, mrr, mulberry32, percentile, topK } from "@/spell-engine/evaluation/metrics";
import { editCost, rankCandidates } from "@/spell-engine/ranking/rank";
import { harmonyOf } from "@/spell-engine/morphology/phonology";

const engine = createSpellEngineV1();

function pack(over: Partial<DataPack> & { entries: DataPack["entries"] }): DataPack {
  return {
    schema: "tore-spell-pack/1",
    id: "t",
    version: "1",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "test", license: "test", redistributable: true },
    ...over,
  } as DataPack;
}

describe("tokenizer", () => {
  it("round-trips exactly and keeps original offsets", () => {
    const text = "Хууль, НҮБ-ын тогтоол 2026.10.05 → info@tore.mn  https://tore.mn/a?b=1 «үг»!\n";
    const tokens = lex(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    for (const t of tokens) expect(text.slice(t.range.start, t.range.end)).toBe(t.text);
  });
  it("classifies protected kinds", () => {
    const kinds = Object.fromEntries(lex("НҮБ-ын TORE TORE.MN 2026 10-р info@tore.mn хууль2 Microsoft").filter((t) => t.kind !== "SPACE").map((t) => [t.text, t.kind]));
    expect(kinds["НҮБ-ын"]).toBe("ACRONYM");
    expect(kinds["TORE"]).toBe("LATIN");
    expect(kinds["TORE.MN"]).toBe("URL");
    expect(kinds["2026"]).toBe("NUMBER");
    expect(kinds["10-р"]).toBe("NUMBER");
    expect(kinds["info@tore.mn"]).toBe("EMAIL");
    expect(kinds["хууль2"]).toBe("MIXED");
  });
  it("marks sentence-initial words", () => {
    const [a, b, c] = lex("Хууль байна. Шүүх").filter((t) => t.kind !== "SPACE" && t.kind !== "PUNCT");
    expect(a!.sentenceInitial).toBe(true);
    expect(b!.sentenceInitial).toBe(false);
    expect(c!.sentenceInitial).toBe(true); // after «.»
  });
  it("never throws on hostile input", () => {
    for (const s of ["", " ", "\u0000", "😀😀", "ааа".repeat(5000), "-'-'-", "\ud800", "http://", "@@@", "1.2.3.4.5"]) {
      expect(() => engine.analyze(s)).not.toThrow();
    }
  });
});

describe("data packs", () => {
  it("bundled packs validate, are redistributable and carry provenance", () => {
    for (const p of BUNDLED_PACKS) {
      expect(validatePack(p)).toEqual([]);
      expect(p.provenance.redistributable).toBe(true);
      expect(p.provenance.license).toMatch(/TORE/);
    }
  });
  it("fails closed on invalid packs", () => {
    expect(validatePack({})).not.toEqual([]);
    expect(validatePack(pack({ entries: [{ w: "Хууль" }] }))).toEqual(expect.arrayContaining([expect.stringMatching(/lower-case/)]));
    expect(validatePack(pack({ entries: [{ w: "abc" }] }))).not.toEqual([]);
    expect(validatePack(pack({ entries: [{ w: "үг" }, { w: "үг" }] }))).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate/)]));
    expect(validatePack({ ...pack({ entries: [] }), provenance: { source: "x", license: "y" } })).not.toEqual([]);
    expect(() => new Lexicon([pack({ coverage: "X" as never, entries: [] })])).toThrow(PackValidationError);
  });
  it("contains no vocabulary in engine TypeScript (data lives in JSON)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/spell-engine/core/engine.ts"), "utf8");
    expect(src).not.toMatch(/"хууль"|"байшин"|"шүүх"/);
  });
  it("no third-party reference data is committed", () => {
    const dir = path.join(process.cwd(), "src/spell-engine/data");
    const all = JSON.stringify(fs.readdirSync(path.join(dir, "packs")));
    expect(all).not.toMatch(/dict-mn|unimorph|hunspell/i);
  });
});

describe("lexicon & user dictionary", () => {
  it("layers are separable", () => {
    const lx = new Lexicon(BUNDLED_PACKS, { layers: ["GENERAL"] });
    expect(lx.has("хууль")).toBe(true);
    expect(lx.has("нүб")).toBe(false);
  });
  it("user dictionary makes unknown words VALID and is case-insensitive", () => {
    const ud = new UserDictionary(["Тоорцог"]);
    const e = createSpellEngineV1({ userDictionary: ud });
    expect(e.checkWord("тоорцог").verdict).toBe("VALID");
    expect(e.checkWord("Тоорцог").reasonCode).toBe("USER_DICTIONARY");
    expect(engine.checkWord("тоорцог").verdict).toBe("UNKNOWN");
    ud.remove("Тоорцог");
    expect(e.checkWord("тоорцог").verdict).toBe("UNKNOWN");
  });
  it("user dictionary beats a rule (a user can bless a flagged word)", () => {
    const e = createSpellEngineV1({ userDictionary: new UserDictionary(["хуулын"]) });
    expect(e.checkWord("хуулын").verdict).toBe("VALID");
  });
});

describe("morphology — task examples via lemma + suffix, not a word list", () => {
  const lemma = createSpellEngineV1({ packs: BUNDLED_PACKS.filter((p) => p.layer === "GENERAL") });
  it.each(["хууль", "хуульд", "хуулийн", "хуулиар", "хуулиас", "хуулиуд", "хуулиудын", "хуулиудыг", "хуулиудад"])("%s is VALID", (w) => {
    expect(lemma.checkWord(w).verdict).toBe("VALID");
  });
  it.each(["байшин", "байшинд", "байшингийн", "байшингаас", "байшингууд"])("%s is VALID (hidden г)", (w) => {
    expect(lemma.checkWord(w).verdict).toBe("VALID");
  });
  it("inflected forms are accepted through MORPHOLOGY, not memorised", () => {
    expect(lemma.lexicon.has("хуулиудын")).toBe(false);
    expect(lemma.checkWord("хуулиудын").reasonCode).toBe("MORPHOLOGY");
    expect(lemma.checkWord("байшингаас").reasonCode).toBe("MORPHOLOGY");
  });
  it("vowel elision and soft stems", () => {
    for (const w of ["ажлаас", "ажлын", "хэргийн", "хэргээс", "асуудлыг"]) expect(lemma.checkWord(w).verdict).toBe("VALID");
  });
  it("wrong-gender suffixes are MISSPELLED with an exact, verified repair", () => {
    const r = lemma.checkWord("гэраас");
    expect(r.verdict).toBe("MISSPELLED");
    expect(r.reasonCode).toBe("HARMONY_SUFFIX");
    expect(r.issue!.suggestions[0]!.text).toBe("гэрээс");
    expect(lemma.checkWord("хотээс").issue!.suggestions[0]!.text).toBe("хотоос");
    expect(lemma.checkWord("хуулын").issue!.suggestions[0]!.text).toBe("хуулийн");
  });
  it("hidden-г nouns do not take bare vowel suffixes", () => {
    expect(lemma.checkWord("байшинаас").verdict).not.toBe("VALID");
  });
  it("loanwords with mixed harmony are never accused", () => {
    expect(harmonyOf("компьютер").gender).toBe("MIXED");
    const e = createSpellEngineV1({ packs: [pack({ entries: [{ w: "компьютер", pos: "N" }] })] });
    for (const w of ["компьютерийн", "компьютерт", "компьютертэй", "компьютероос"]) {
      expect(e.checkWord(w).verdict).not.toBe("MISSPELLED");
    }
  });
  it("analyzer exposes no parse for non-words", () => {
    const m = new MorphAnalyzer(lemma.lexicon);
    expect(m.analyze("хуулзл").parses).toEqual([]);
  });
});

describe("verdict contract", () => {
  it("every issue carries the full contract and never auto-applies", () => {
    const r = engine.analyze("Тэр хунэтаи ирлээ, хуулын заалт хууль2 байна.", { reportUnknown: true });
    expect(r.engineVersion).toMatch(/^1\./);
    expect(r.dataPackVersion).toContain("tore-general-seed");
    for (const i of r.issues) {
      expect(["MISSPELLED", "UNKNOWN"]).toContain(i.verdict);
      expect(i.reasonCode).toBeTruthy();
      expect(i.detectionConfidence).toBeGreaterThanOrEqual(0);
      expect(i.range.end).toBeGreaterThan(i.range.start);
      expect(i.autoApplySafe).toBe(false);
      if (i.verdict === "UNKNOWN") {
        expect(i.suggestions).toEqual([]);
        expect(i.severity).toBe("INFO");
        expect(i.suggestionConfidence).toBe(0);
      } else {
        expect(i.suggestions.length).toBeGreaterThan(0);
        expect(i.suggestionConfidence).toBe(i.suggestions[0]!.confidence);
      }
    }
    expect(r.issues.some((i) => i.verdict === "MISSPELLED")).toBe(true);
  });
  it("UNKNOWN is not reported by default and gets no replacement", () => {
    // invented strings: stay UNKNOWN however much real vocabulary the packs gain
    const r = engine.analyze("бүлжирэн хөлгөйтөр");
    expect(r.issues).toEqual([]);
    expect(r.stats.unknownCount).toBe(2);
  });
  it("issue ranges point at the user's original characters", () => {
    const text = "Бид  «хунэтаи»  хүн.";
    const i = engine.analyze(text).issues[0]!;
    expect(text.slice(i.range.start, i.range.end)).toBe("хунэтаи");
  });
  it("suggestion casing follows the original token", () => {
    expect(engine.analyze("Хунэтаи хүн ирлээ").issues[0]?.suggestions[0]?.text).toBe("Хүнтэй");
    expect(engine.analyze("ХУНЭТАИ").issues.length).toBe(0); // ALL-CAPS tokens are never rewritten
  });
  it("min detection confidence demotes to UNKNOWN", () => {
    const r = engine.analyze("хуулын", { minDetectionConfidence: 0.99 });
    expect(r.issues).toEqual([]);
    expect(r.stats.unknownCount).toBe(1);
  });
  it("LanguageEngine compatibility", async () => {
    const res = await engine.check({ text: "хунэтаи" });
    expect(res.engine.id).toBe("tore-spell-language-engine");
    expect(res.issues[0]!.suggestions[0]).toEqual({ text: "хүнтэй", rank: 1 });
    expect(res.issues[0]!.original).toBe("хунэтаи");
  });
});

describe("protected tokens are never rewritten", () => {
  const cases = ["Тогтох", "НҮБ", "НҮБ-ын", "ТОРЕ", "TORE", "TORE.MN", "2026", "2026.10.05", "info@tore.mn", "https://tore.mn/spell", "10-р", "№12", "Microsoft", "A4", "ISO-9001"];
  it.each(cases)("%s", (t) => {
    const r = engine.analyze(`Энэ ${t} байна.`);
    expect(r.issues.filter((i) => i.verdict === "MISSPELLED")).toEqual([]);
    expect(engine.checkWord(t).verdict).not.toBe("MISSPELLED");
  });
  it("mid-sentence capitalised unknown words are name candidates, never corrected", () => {
    const r = engine.analyze("Тэр Хунэтаи гэгчтэй уулзав", { reportUnknown: true });
    const a = r.tokens.find((t) => t.token.text === "Хунэтаи")!;
    expect(a.verdict).toBe("UNKNOWN");
    expect(a.reasonCode).toBe("PROPER_NOUN_CANDIDATE");
  });
  it("unlisted acronyms are UNKNOWN, not errors", () => {
    expect(engine.checkWord("ЭЗЦ").verdict).toBe("UNKNOWN");
    expect(engine.checkWord("ЭЗЦ").reasonCode).toBe("ACRONYM_UNLISTED");
  });
});

describe("orthography rules", () => {
  it.each([
    ["хуулиин", "DIGRAPH_II_FOR_IY", "хуулийн"],
    ["хэрэгг", "DOUBLED_FINAL_LETTER", "хэрэг"],
    ["хууль2", "DIGIT_GLUED", "хууль"],
    ["хyуль", "MIXED_SCRIPT_LOOKALIKE", "хууль"],
    ["өчигдр", "TYPO_PAIR", "өчигдөр"],
    ["надэд", "HARMONY_VIOLATION_NEIGHBOR", "надад"],
    ["шиидвэр", "DIGRAPH_II_FOR_IY", "шийдвэр"],
  ])("%s → %s → %s", (w, reason, fix) => {
    const r = engine.checkWord(w);
    expect(r.verdict).toBe("MISSPELLED");
    expect(r.reasonCode).toBe(reason);
    expect(r.issue!.suggestions[0]!.text).toBe(fix);
  });
  it("a rule never proposes a repair that is not itself valid", () => {
    const e = createSpellEngineV1({ packs: [pack({ entries: [{ w: "ном", pos: "N" }] })], typoPairs: [{ wrong: "нмо", right: "несуществующий" }] });
    expect(e.checkWord("нмо").verdict).toBe("UNKNOWN");
  });
  it("SEED coverage disables edit-distance detection", () => {
    for (const w of ["хэрг", "ширэх", "зорчил", "хууль" + "ааа"]) expect(engine.checkWord(w).verdict).not.toBe("MISSPELLED");
  });
  it("BROAD coverage enables a unique-neighbour rule, with a margin", () => {
    const broad = createSpellEngineV1({
      packs: [pack({ coverage: "BROAD", entries: ["шийдвэр", "захирал", "тогтоол"].map((w) => ({ w, pos: "N" as const })) })],
    });
    const hit = broad.checkWord("шидвэр");
    expect(hit.verdict).toBe("MISSPELLED");
    expect(hit.reasonCode).toBe("EDIT_DISTANCE_UNIQUE");
    expect(hit.issue!.suggestions[0]!.text).toBe("шийдвэр");
    // ambiguity → abstain
    const amb = createSpellEngineV1({ packs: [pack({ coverage: "BROAD", entries: ["хэрэг", "хэсэг"].map((w) => ({ w, pos: "N" as const })) })] });
    expect(amb.checkWord("хэсэг").verdict).toBe("VALID");
    expect(amb.checkWord("хэрсэг").verdict).toBe("UNKNOWN");
  });
});

describe("candidate index & ranking", () => {
  const words = ["хэрэг", "хэсэг", "хэрэв", "шийдвэр", "ширхэг", "ирэх"];
  const idx = new DeleteIndex({ keys: () => words[Symbol.iterator](), has: (k) => words.includes(k) });
  it("finds distance-1 neighbours including transpositions, without scanning", () => {
    expect(idx.candidates("хэрг")).toContain("хэрэг");
    expect(idx.candidates("шийдвер")).toContain("шийдвэр");
    expect(idx.candidates("хэреэг").sort()).toEqual(["хэрэг"]);
    expect(idx.candidates("шийвдэр")).toContain("шийдвэр"); // transposition
    expect(idx.candidates("абвгд")).toEqual([]);
  });
  it("matches brute-force Damerau on a larger synthetic lexicon", () => {
    const rng = mulberry32(7);
    const alpha = "аэиоуөүбвгдлмнрст";
    const lexi = Array.from({ length: 800 }, () => Array.from({ length: 4 + Math.floor(rng() * 5) }, () => alpha[Math.floor(rng() * alpha.length)]!).join(""));
    const set = new Set(lexi);
    const di = new DeleteIndex({ keys: () => set.values(), has: (k) => set.has(k) });
    for (let n = 0; n < 60; n += 1) {
      const q = injectError(lexi[n]!, n % 2 ? "DELETE" : "TRANSPOSE", rng) ?? lexi[n]!;
      const brute = lexi.filter((w) => w !== q && damerauDistance(q, w, 1) <= 1).sort();
      expect([...new Set(di.candidates(q))].sort()).toEqual([...new Set(brute)]);
    }
  });
  it("ranks plausible slips above implausible ones; frequency only breaks ties", () => {
    expect(editCost("шөрөг", "шорог")).toBeLessThan(editCost("шөрөг", "шөрөв") + 0.5);
    expect(editCost("кох", "көх")).toBeLessThan(1);
    const r = rankCandidates("хэрг", [
      { text: "хэрэв", freq: 1000, layerRank: 0 },
      { text: "хэрэг", freq: 1, layerRank: 0 },
    ]);
    expect(r[0]!.text).toBe("хэрэг");
  });
});

describe("evaluation helpers", () => {
  it("metrics", () => {
    expect(percentile([1, 2, 3, 4, 100], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 100], 99)).toBe(100);
    expect(fBeta({ tp: 8, fp: 2, fn: 8, tn: 0 }, 0.5)).toBeGreaterThan(fBeta({ tp: 8, fp: 8, fn: 2, tn: 0 }, 0.5));
    expect(topK([1, 2, null, 4], 3)).toBe(0.5);
    expect(mrr([1, 2, null])).toBeCloseTo(0.5);
  });
  it("seeded injection is deterministic", () => {
    const a = injectError("шийдвэр", "VOWEL_SWAP", mulberry32(1));
    const b = injectError("шийдвэр", "VOWEL_SWAP", mulberry32(1));
    expect(a).toBe(b);
  });
});

describe("engine boundary", () => {
  it("src/spell-engine imports nothing from the app, node, or frameworks", () => {
    const root = path.join(process.cwd(), "src/spell-engine");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.name.endsWith(".ts")) files.push(path.join(d, e.name));
      }
    };
    walk(root);
    const bad: string[] = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (!spec.startsWith(".")) bad.push(`${path.relative(root, f)} → ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
