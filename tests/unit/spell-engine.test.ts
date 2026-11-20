import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildOrthographySuggestions } from "@/domain/mongolian-orthography";
import { EngineRegistry, checkResultViolations, type LanguageEngine } from "@/spell-engine";
import {
  ORTHOGRAPHY_V0_ENGINE_ID,
  OrthographyV0Engine,
} from "@/infrastructure/spell/orthography-v0-engine";

const ENGINE_DIR = path.resolve(__dirname, "../../src/spell-engine");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith(".ts") ? [full] : [];
  });
}

describe("spell-engine dependency boundary", () => {
  it("imports nothing from the app, framework, database or Node built-ins", () => {
    const offenders: string[] = [];
    for (const file of files(ENGINE_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (!spec.startsWith("./") && !spec.startsWith("../")) offenders.push(`${path.basename(file)} → ${spec}`);
        if (spec.startsWith("../")) {
          const resolved = path.resolve(path.dirname(file), spec);
          if (!resolved.startsWith(ENGINE_DIR)) offenders.push(`${path.basename(file)} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("licensing code depends only on the LanguageEngine contract, never on a concrete engine", () => {
    const roots = ["domain/spell", "application/use-cases/spell", "app/api/spell"].map((r) =>
      path.resolve(__dirname, "../../src", r),
    );
    for (const root of roots) {
      for (const file of files(root)) {
        const src = readFileSync(file, "utf8");
        expect(src, file).not.toMatch(/mongolian-orthography|orthography-v0-engine/);
      }
    }
  });
});

describe("OrthographyV0Engine (baseline, wraps the existing orthography engine)", () => {
  const engine = new OrthographyV0Engine();
  const samples = [
    "",
    "Сайн байна уу",
    "Би ном уншиж байна. Тэр хотод очив.",
    "хууль тогтоомж зөрчсөн хэргийн талаар",
    "Мөнгөө авсан шүү дээ, баярлалаа!!!",
    "😀 эмодзи ба 123 тоо, Latin text: sain baina uu",
    "Нэг\nхоёр\tгурав   дөрөв",
    "юу1 буруу бичсэн",
    "ААААААААААААААААААААААААААААААААААААААААА",
  ];

  it("declares what it is and what it is not", () => {
    expect(engine.info).toMatchObject({ id: ORTHOGRAPHY_V0_ENGINE_ID, maturity: "BASELINE_RULES" });
    expect(engine.info.capabilities).not.toContain("GRAMMAR");
    expect(engine.info.capabilities).not.toContain("PUNCTUATION");
    expect(engine.info.capabilities).not.toContain("STYLE");
  });

  for (const text of samples) {
    it(`conforms to the contract for ${JSON.stringify(text.slice(0, 30))}`, async () => {
      for (const convert of [false, true]) {
        const result = await engine.check({ text, options: { convertLatinToCyrillic: convert } });
        expect(checkResultViolations(text, result)).toEqual([]);
        expect(result.engine).toEqual({ id: engine.info.id, version: engine.info.version });
      }
    });
  }

  it("is deterministic and never throws on arbitrary input", async () => {
    const a = await engine.check({ text: samples[3]! });
    const b = await engine.check({ text: samples[3]! });
    expect(b).toEqual(a);
    const fuzz = Array.from({ length: 50 }, (_, i) =>
      String.fromCharCode(...Array.from({ length: 40 }, (_, j) => (i * 977 + j * 31) % 0xd7ff)),
    );
    for (const text of fuzz) {
      expect(checkResultViolations(text, await engine.check({ text }))).toEqual([]);
    }
  });

  it("surfaces every suggestion the underlying engine produces, none invented or dropped", async () => {
    for (const text of ["хууль тогтомж", "Би ном унших байна", "sain baina uu", "юу1 буруу"]) {
      const raw = buildOrthographySuggestions(text, { includeLatinToCyrillic: true });
      const result = await engine.check({ text, options: { convertLatinToCyrillic: true } });
      expect(result.issues).toHaveLength(raw.suggestions.length);
      expect(result.issues.map((i) => i.span.start).sort((a, b) => a - b)).toEqual(
        raw.suggestions.map((s) => s.start).sort((a, b) => a - b),
      );
      expect(result.stats).toEqual({ characterCount: raw.characterCount, wordCount: raw.wordCount });
    }
  });

  it("offers Latin→Cyrillic conversion only when asked", async () => {
    const text = "sain baina uu";
    const off = await engine.check({ text });
    const on = await engine.check({ text, options: { convertLatinToCyrillic: true } });
    expect(off.issues.filter((i) => i.category === "SCRIPT_CONVERSION")).toHaveLength(0);
    for (const i of on.issues.filter((i) => i.category === "SCRIPT_CONVERSION")) {
      expect(i.suggestions.length).toBeGreaterThan(0);
    }
  });
});

describe("conformance checker", () => {
  const ok = { engine: { id: "x", version: "1" }, stats: { characterCount: 5, wordCount: 1 } };
  it("flags out-of-bounds spans, mismatched originals, bad ranks, duplicates and ordering", () => {
    const text = "abcde";
    const issue = (over: object) => ({ id: "1", category: "SPELLING" as const, span: { start: 0, end: 2 }, original: "ab", message: "m", ruleIds: [], suggestions: [], ...over });
    expect(checkResultViolations(text, { ...ok, issues: [issue({})] })).toEqual([]);
    expect(checkResultViolations(text, { ...ok, issues: [issue({ span: { start: 3, end: 9 }, original: "de" })] })).not.toEqual([]);
    expect(checkResultViolations(text, { ...ok, issues: [issue({ original: "zz" })] })).not.toEqual([]);
    expect(checkResultViolations(text, { ...ok, issues: [issue({ span: { start: 2, end: 2 }, original: "" })] })).not.toEqual([]);
    expect(checkResultViolations(text, { ...ok, issues: [issue({ suggestions: [{ text: "x", rank: 2 }] })] })).not.toEqual([]);
    expect(checkResultViolations(text, { ...ok, issues: [issue({}), issue({})] })).not.toEqual([]);
    expect(checkResultViolations(text, { ...ok, issues: [issue({ id: "a", span: { start: 2, end: 3 }, original: "c" }), issue({ id: "b" })] })).not.toEqual([]);
  });
});

describe("EngineRegistry", () => {
  const fake = (id: string): LanguageEngine => ({
    info: { id, version: "1", capabilities: [], maturity: "BASELINE_RULES" },
    check: async () => ({ engine: { id, version: "1" }, issues: [], stats: { characterCount: 0, wordCount: 0 } }),
  });
  it("supports swapping the default engine without touching callers", () => {
    const r = new EngineRegistry();
    r.register(fake("a"));
    expect(r.get().info.id).toBe("a");
    r.register(fake("b"), { makeDefault: true });
    expect(r.get().info.id).toBe("b");
    expect(r.get("a").info.id).toBe("a");
    expect(r.list()).toHaveLength(2);
    expect(() => r.register(fake("a"))).toThrow();
    expect(() => r.get("zzz")).toThrow();
    expect(() => new EngineRegistry().get()).toThrow();
  });
});
