import { describe, expect, it } from "vitest";
import {
  BUNDLED_PACKS,
  Lexicon,
  PackValidationError,
  ResearchDataForbiddenError,
  createSpellEngineV1,
  validatePack,
  type DataPack,
  type ExternalLexiconProvider,
} from "@/spell-engine";
import { plausibleEdits } from "@/spell-engine/candidates/plausible-edits";

/** In-memory stand-in for a research lexicon + frequency table (no third-party data). */
function provider(words: Record<string, number>, names: Record<string, number> = {}): ExternalLexiconProvider {
  return {
    id: "research:test",
    dataClass: "C_RESEARCH_ONLY",
    redistributable: false,
    accepts: (k) => k in words,
    frequencyPerMillion: (k) => words[k] ?? 0,
    nameLikelihood: (k) => names[k] ?? 0,
  };
}

const pack = (over: Partial<DataPack>): DataPack =>
  ({
    schema: "tore-spell-pack/1",
    id: "t",
    version: "1",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "t", license: "t", redistributable: true, dataClass: "A_TORE_OWNED" },
    entries: [{ w: "хууль", pos: "N" }],
    ...over,
  }) as DataPack;

describe("data classes (A/B ship, C/D never)", () => {
  it("every bundled pack is class A or B, redistributable", () => {
    for (const p of BUNDLED_PACKS) {
      expect(["A_TORE_OWNED", "B_EXTERNAL_LICENSED"]).toContain(p.provenance.dataClass);
      expect(p.provenance.redistributable).toBe(true);
    }
  });

  it("class C/D data can never be declared redistributable, and class A/B must be", () => {
    const research = pack({ provenance: { source: "x", license: "x", redistributable: true, dataClass: "C_RESEARCH_ONLY" } });
    expect(validatePack(research).join(" ")).toMatch(/can never be redistributable/);
    const bad = pack({ provenance: { source: "x", license: "x", redistributable: false, dataClass: "A_TORE_OWNED" } });
    expect(validatePack(bad).join(" ")).toMatch(/must be redistributable/);
  });

  it("the lexicon refuses research/benchmark packs unless explicitly allowed", () => {
    const d = pack({ provenance: { source: "x", license: "x", redistributable: false, dataClass: "D_BENCHMARK_ONLY" } });
    expect(() => new Lexicon([d])).toThrow(PackValidationError);
    expect(new Lexicon([d], { allowResearchData: true }).has("хууль")).toBe(true);
    // legacy packs without a class: redistributable:false is refused the same way
    const legacy = pack({ provenance: { source: "x", license: "x", redistributable: false } });
    expect(() => new Lexicon([legacy])).toThrow(PackValidationError);
  });
});

describe("research lexicon boundary", () => {
  it("is refused outside an explicit development environment", () => {
    const p = provider({ байна: 1000 });
    expect(() => createSpellEngineV1({ research: p })).toThrow(ResearchDataForbiddenError);
    expect(() => createSpellEngineV1({ research: p, environment: "production" })).toThrow(ResearchDataForbiddenError);
    expect(() => createSpellEngineV1({ research: p, environment: "development" })).not.toThrow();
  });

  it("without a provider the shipping engine is unchanged (UNKNOWN stays UNKNOWN)", () => {
    const e = createSpellEngineV1();
    expect(e.checkWord("хөлгөйтөр").verdict).toBe("UNKNOWN");
  });

  it("accepts words the provider knows and states so in the data version", () => {
    const e = createSpellEngineV1({ research: provider({ хөлгөйтөр: 50 }), environment: "development" });
    const r = e.analyze("и хөлгөйтөр");
    expect(r.tokens[1]!.verdict).toBe("VALID");
    expect(r.tokens[1]!.reasonCode).toBe("RESEARCH_LEXICON");
    expect(r.dataPackVersion).toContain("research:test");
  });

  const words = { сайхан: 80, хамт: 900, хэрэг: 400, хэрэгтэй: 60, маргааш: 300 };

  it("flags a RARE absent string whose repair dominates it, with the right top suggestion", () => {
    const e = createSpellEngineV1({ research: provider(words), environment: "development" });
    const r = e.analyze("и сайхн");
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.suggestions[0]!.text).toBe("сайхан");
    expect(r.issues[0]!.autoApplySafe).toBe(false);
  });

  it("restores a doubled vowel and a dropped consonant", () => {
    const e = createSpellEngineV1({ research: provider(words), environment: "development" });
    expect(e.analyze("и маргаш").issues[0]?.suggestions[0]?.text).toBe("маргааш");
    expect(e.analyze("и хамтт").issues[0]?.suggestions[0]?.text).toBe("хамт");
  });

  it("never flags a FREQUENT string even when a repair exists (dictionary gap, not a typo)", () => {
    const frequent = { ...provider(words), frequencyPerMillion: (k: string) => (k === "хэрг" ? 40 : (words as Record<string, number>)[k] ?? 0) };
    const e = createSpellEngineV1({ research: frequent, environment: "development" });
    expect(e.analyze("и хэрг").issues).toHaveLength(0);
    expect(e.checkWord("хэрг").verdict).toBe("UNKNOWN");
    // the same string, rare, IS flagged — frequency is what separates usage from a slip
    const rare = { ...provider(words), frequencyPerMillion: (k: string) => (k === "хэрг" ? 0.1 : (words as Record<string, number>)[k] ?? 0) };
    expect(createSpellEngineV1({ research: rare, environment: "development" }).analyze("и хэрг").issues[0]?.suggestions[0]?.text).toBe("хэрэг");
  });

  it("never flags a likely proper noun", () => {
    const e = createSpellEngineV1({ research: provider(words, { сайхн: 0.9 }), environment: "development" });
    expect(e.analyze("и сайхн").issues).toHaveLength(0);
  });

  it("abstains (UNKNOWN) when two repairs are equally good — no defensible correction", () => {
    const tie = provider({ ном: 100, нам: 100 });
    const e = createSpellEngineV1({ research: tie, environment: "development", researchMinLength: 3 });
    expect(e.analyze("и ним").issues).toHaveLength(0);
    expect(e.checkWord("ним").verdict).toBe("UNKNOWN");
    // one clearly better repair → flagged
    const clear = provider({ ном: 500, нам: 5 });
    expect(createSpellEngineV1({ research: clear, environment: "development", researchMinLength: 3 }).analyze("и ним").issues[0]?.suggestions[0]?.text).toBe("ном");
  });

  it("protected tokens are never touched in research mode", () => {
    const e = createSpellEngineV1({ research: provider(words), environment: "development" });
    for (const t of ["https://tore.mn/x", "info@tore.mn", "2026.10.06", "НҮБ-ын", "iPhone"]) {
      expect(e.analyze(`и ${t}`).issues).toHaveLength(0);
    }
  });
});

describe("plausible-edit candidate generator (error model)", () => {
  it("proposes the repairs real writers need, and stays small", () => {
    expect(plausibleEdits("хэрг")).toContain("хэрэг"); // vowel dropped in a cluster
    expect(plausibleEdits("маргаш")).toContain("маргааш"); // long vowel written short
    expect(plausibleEdits("хамтт")).toContain("хамт"); // doubled letter
    expect(plausibleEdits("зорчил")).toContain("зөрчил"); // о/ө
    expect(plausibleEdits("дашрамд")).toContain("ташрамд"); // д/т class
    expect(plausibleEdits("хууль").length).toBeLessThan(400);
  });
});
