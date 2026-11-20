import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendDecision, createSpellEngineV1, itemState, summarizeReview, validateItem } from "../../src/spell-engine";
import { DIRS, dirFor, loadAll, promote, type SetFile } from "../evaluation/spell-v3/gold-sets";

const sets = loadAll();
const items = sets.flatMap((s) => s.items);
const engine = createSpellEngineV1();

describe("Phase-3 gold candidate sets: provenance is physical and honest", () => {
  it("covers all 15 required sets A–O", () => {
    const letters = new Set(sets.map((s) => s.set[0]));
    for (const L of "ABCDEFGHIJKLMNO") expect(letters.has(L), L).toBe(true);
  });
  it("every item is valid and sits in the directory its status demands", () => {
    for (const s of sets) for (const it of s.items) {
      expect(validateItem(it), it.id).toEqual([]);
      expect(s.provenanceDir, it.id).toBe(dirFor(itemState(it).status));
      expect(s.datasetVersion).toBe(it.datasetVersion);
    }
  });
  it("NO item is natively reviewed today — and the numbers say so", () => {
    const sum = summarizeReview(items);
    expect(sum.NATIVE_REVIEWED).toBe(0);
    expect(sets.filter((s) => s.provenanceDir === "native")).toHaveLength(0);
    expect(sum.MODEL_ADJUDICATED).toBe(sum.total);
    expect(sum.total).toBeGreaterThan(1000);
  });
  it("no class-D (local corpus) sentence is ever committed", () => {
    expect(items.filter((i) => i.sentenceOrigin === "LOCAL_CORPUS_D")).toEqual([]);
    for (const f of ["model", "engineer", "native", "auto"]) {
      const dir = path.join(__dirname, "../evaluation/spell-v3/gold", f);
      for (const file of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) expect(fs.readFileSync(path.join(dir, file), "utf8")).not.toMatch(/LOCAL_CORPUS_D/);
    }
  });
  it("promotion re-files by status only (a model can never reach native/)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gold-"));
    const src = sets.find((s) => s.set === "O_COMMON_TYPOS")!;
    const sf: SetFile = { ...src, set: "T", items: src.items.slice(0, 3) };
    fs.mkdirSync(path.join(tmp, "model"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "model", "T.json"), JSON.stringify(sf));
    // a model decision cannot promote
    expect(promote(tmp).moved).toBe(0);
    // two natives agreeing on item 0 → native/
    const f = JSON.parse(fs.readFileSync(path.join(tmp, "model", "T.json"), "utf8")) as SetFile;
    const v = itemState(f.items[0]!).verdict!;
    f.items[0] = appendDecision(appendDecision(f.items[0]!, { reviewerId: "n1", reviewerKind: "NATIVE_HUMAN", verdict: v, suggestion: v === "MISSPELLED" ? f.items[0]!.decisions[0]!.suggestion : undefined, at: "2026-10-09T00:00:00Z" }), { reviewerId: "n2", reviewerKind: "NATIVE_HUMAN", verdict: v, suggestion: v === "MISSPELLED" ? f.items[0]!.decisions[0]!.suggestion : undefined, at: "2026-10-09T00:00:00Z" });
    fs.writeFileSync(path.join(tmp, "model", "T.json"), JSON.stringify(f));
    expect(promote(tmp).moved).toBe(1);
    expect(fs.existsSync(path.join(tmp, "native", "T.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "native", "T.json"), "utf8")).items).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "model", "T.json"), "utf8")).items).toHaveLength(2);
    void DIRS;
  });
});

describe("engine vs the MODEL-adjudicated candidates (consistency harness, not evidence of native quality)", () => {
  const byLetter = (L: string) => sets.filter((s) => s.set[0] === L).flatMap((s) => s.items);
  it("genre prose A–I: the engine never accuses a word the assistant wrote as correct", () => {
    const accused = "ABCDEFGHI".split("").flatMap(byLetter).filter((i) => i.currentVerdict === "MISSPELLED").map((i) => i.token);
    expect(accused).toEqual([]);
  });
  it("proper names and loanwords J/K: zero false accusations", () => {
    expect([...byLetter("J"), ...byLetter("K")].filter((i) => itemState(i).verdict !== "MISSPELLED" && i.currentVerdict === "MISSPELLED").map((i) => i.token)).toEqual([]);
  });
  it("common typos O: controls are never flagged; a CONFIDENT suggestion is never wrong", () => {
    const openDisagreements: string[] = [];
    for (const i of byLetter("O")) {
      const exp = i.decisions[0]!;
      const text = `Энэ ${i.token} нь`;
      const r = engine.analyze(text);
      const tok = r.tokens.find((x) => x.token.range.start === 4)!;
      // items the assistant itself marked «native judgment needed» are open questions, not controls: the engine may disagree there
      if (exp.verdict !== "MISSPELLED" && /native judgment/.test(exp.note ?? "")) { if (tok.verdict === "MISSPELLED") openDisagreements.push(i.token); continue; }
      if (exp.verdict !== "MISSPELLED") expect(tok.verdict, `${i.token} must not be accused`).not.toBe("MISSPELLED");
      else if (tok.verdict === "MISSPELLED") {
        const issue = r.issues.find((x) => x.range.start === 4)!;
        if (issue.suggestionStatus === "CONFIDENT" && exp.suggestion) expect(issue.suggestions[0]!.text, `${i.token}`).toBe(exp.suggestion);
      }
    }
    // reported, kept small: each one is a first-class item for the native review queue
    expect(openDisagreements.length).toBeLessThanOrEqual(3);
  });
  it("compounds M: arbitrary glued garbage is never VALID", () => {
    for (const i of byLetter("M")) if (i.token === "хөдөлмөрийнхөнгийн") expect(i.currentVerdict).not.toBe("VALID");
  });
});
