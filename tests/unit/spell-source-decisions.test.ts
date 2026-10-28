import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESEARCH_SOURCES, SOURCES, decisionOf, renderSourceDecisions } from "../../scripts/spell-data/sources";

describe("lexicon source decisions", () => {
  it("only VERIFIED_SHIPPABLE sources are APPROVED, and nothing else can ever be bundled", () => {
    for (const s of SOURCES) expect(decisionOf(s) === "APPROVED").toBe(s.status === "VERIFIED_SHIPPABLE");
    for (const s of RESEARCH_SOURCES) expect(s.bundlable).toBe(false);
  });
  it("contradictory, share-alike, unlicensed and unreachable sources are never approved", () => {
    for (const id of ["dict-mn", "tugstugi-datasets", "unimorph-khk", "wikipedia-mn", "wiktionary-mn", "monwn", "cc100-mn", "common-voice-mn-text", "tatoeba-mn"]) {
      const s = SOURCES.find((x) => x.sourceId === id);
      expect(s, id).toBeDefined();
      expect(decisionOf(s!), id).not.toBe("APPROVED");
    }
    expect(decisionOf(SOURCES.find((x) => x.sourceId === "dict-mn")!)).toBe("REJECTED"); // redistribution forbidden
    expect(decisionOf(SOURCES.find((x) => x.sourceId === "tugstugi-datasets")!)).toBe("REJECTED"); // no licence = all rights reserved
    expect(decisionOf(SOURCES.find((x) => x.sourceId === "unimorph-khk")!)).toBe("LEGAL_REVIEW_REQUIRED");
  });
  it("no approved third-party lexicon exists (every approved source is TORE-owned)", () => {
    for (const s of SOURCES.filter((x) => decisionOf(x) === "APPROVED")) expect(s.dataClass).toBe("A_TORE_OWNED");
  });
  it("docs/spell/LEXICON-SOURCE-DECISIONS.md is current (run scripts/spell-data/source-decisions.ts)", () => {
    expect(fs.readFileSync(path.resolve(__dirname, "../../docs/spell/LEXICON-SOURCE-DECISIONS.md"), "utf8")).toBe(renderSourceDecisions());
  });
});
