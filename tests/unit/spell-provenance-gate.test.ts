import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_PACKS } from "@/spell-engine";
import { assertShippable, validateRegistry } from "../../scripts/spell-data/provenance";
import { SOURCES, sourceById, type SourceRecord } from "../../scripts/spell-data/sources";

describe("source registry and the release gate (only VERIFIED_SHIPPABLE data ships)", () => {
  it("the registry is internally consistent", () => {
    expect(validateRegistry()).toEqual([]);
  });
  it("every external source is recorded with a blunt status; dict-mn and its wrappers are NOT shippable", () => {
    for (const id of ["dict-mn", "npm-dictionary-mn", "npm-cspell-dict-mn", "npm-mn-spellcheck", "unimorph-khk", "tugstugi-datasets"]) {
      const s = sourceById(id)!;
      expect(s, id).toBeDefined();
      expect(s.status, id).not.toBe("VERIFIED_SHIPPABLE");
      expect(s.dataClass === "C_RESEARCH_ONLY" || s.dataClass === "D_BENCHMARK_ONLY").toBe(true);
    }
    expect(sourceById("dict-mn")!.licenseText).toMatch(/Өөрчлөн тараахыг хориглоно/);
    expect(sourceById("dict-mn")!.licenseText).toMatch(/LaTeX Project Public License/);
  });
  it("only TORE-created sources are VERIFIED_SHIPPABLE today", () => {
    const shippable = SOURCES.filter((s) => s.status === "VERIFIED_SHIPPABLE");
    expect(shippable.length).toBeGreaterThan(0);
    for (const s of shippable) expect(s.publisher).toBe("TORE");
  });
  it("a shippable source that cannot prove its licence is rejected by the registry validator", () => {
    const fake: SourceRecord = { ...sourceById("dict-mn")!, sourceId: "fake", status: "VERIFIED_SHIPPABLE", dataClass: "B_EXTERNAL_LICENSED", localUse: "NONE" };
    const problems = validateRegistry([fake]);
    expect(problems.join(" ")).toMatch(/commercialUse=YES|redistribution=YES|derivativeWorks=YES/);
  });
  it("assertShippable refuses missing, unknown and non-shippable sources", () => {
    expect(() => assertShippable(undefined, "p")).toThrow(/no sourceIds/);
    expect(() => assertShippable([], "p")).toThrow(/no sourceIds/);
    expect(() => assertShippable(["nope"], "p")).toThrow(/unknown source/);
    expect(() => assertShippable(["dict-mn"], "p")).toThrow(/only VERIFIED_SHIPPABLE/);
    expect(() => assertShippable(["tugstugi-datasets"], "p")).toThrow(/UNVERIFIED/);
    expect(() => assertShippable(["tore-core-seed", "tore-authored-vocab-2026-10"], "p")).not.toThrow();
  });
  it("EVERY bundled pack cites only shippable sources, is class A/B, redistributable, and states its review status", () => {
    for (const p of BUNDLED_PACKS) {
      expect(() => assertShippable(p.provenance.sourceIds, p.id), p.id).not.toThrow();
      expect(["A_TORE_OWNED", "B_EXTERNAL_LICENSED"]).toContain(p.provenance.dataClass);
      expect(p.provenance.redistributable).toBe(true);
      expect(["PENDING_NATIVE_REVIEW", "NATIVE_REVIEWED"]).toContain(p.provenance.reviewStatus);
    }
  });
  it("AI-drafted vocabulary is never labelled native-reviewed", () => {
    for (const p of BUNDLED_PACKS.filter((x) => x.id.startsWith("tore-vocab-"))) {
      expect(p.provenance.reviewStatus).toBe("PENDING_NATIVE_REVIEW");
      expect(p.provenance.sourceIds).toContain("tore-authored-vocab-2026-10");
    }
  });
  it("research data and the research loader are not reachable from the engine bundle", () => {
    const root = path.resolve(__dirname, "../../src/spell-engine");
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(root).filter((x) => /\.(ts|json)$/.test(x))) {
      const t = fs.readFileSync(f, "utf8");
      expect(/hunspell-asm|mn_MN\.(dic|aff)|\.spell-research/.test(t), path.relative(root, f)).toBe(false);
    }
  });
});
