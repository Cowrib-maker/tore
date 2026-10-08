import { describe, expect, it } from "vitest";
import { dirFor } from "../evaluation/spell-v3/gold-sets";
import { appendDecision, exportQueueTsv, importDecisionsTsv, itemState, paradigmAudit, paradigmGold, reviewQueue, summarizeReview as summarize, validateDecision, type SpellReviewItem } from "@/spell-engine";

/**
 * The reviewer ids below are TEST FIXTURES that exercise the consensus rules. No real review is represented, and nothing here may be
 * copied into gold/native: real native review is still 0.
 */
const lemma = (token = "ном"): SpellReviewItem => ({
  schema: "tore-spell-review/1", id: `LEMMA:GENERAL:N:${token}`, datasetVersion: "test", token, sentenceOrigin: "NONE", category: "VALID",
  currentVerdict: "VALID", source: "test", provenance: "MODEL_ASSISTANT", lemma: { pos: "N", domain: "GENERAL", kind: "COMMON", confidence: "MEDIUM", origin: "test" }, decisions: [],
});
const at = "2026-10-08T00:00:00Z";
const d = (reviewerId: string, extra: object, kind: "NATIVE_HUMAN" | "ENGINEER_HUMAN" = "NATIVE_HUMAN") => ({ reviewerId, reviewerKind: kind, verdict: "VALID" as const, at, ...extra });

describe("reviewer actions: ACCEPT / REJECT / CORRECT / FLAG", () => {
  it("each action demands exactly what it means", () => {
    expect(validateDecision(d("a", { action: "ACCEPT" }))).toEqual([]);
    expect(validateDecision({ ...d("a", { action: "ACCEPT" }), verdict: "MISSPELLED" })).not.toEqual([]);
    expect(validateDecision({ ...d("a", { action: "REJECT" }), verdict: "MISSPELLED" })).toEqual([]);
    expect(validateDecision({ ...d("a", { action: "REJECT" }), verdict: "MISSPELLED", suggestion: "x" })).not.toEqual([]);
    expect(validateDecision({ ...d("a", { action: "CORRECT" }), verdict: "MISSPELLED", suggestion: "ном" })).toEqual([]);
    expect(validateDecision(d("a", { action: "CORRECT" }))).not.toEqual([]); // CORRECT with nothing corrected
    expect(validateDecision(d("a", { action: "CORRECT", lemmaCorrection: { pos: "ADJ" } }))).toEqual([]);
    expect(validateDecision({ ...d("a", { action: "FLAG" }), verdict: "UNKNOWN" })).toEqual([]);
    expect(validateDecision(d("a", { action: "FLAG" }))).not.toEqual([]);
  });
  it("a standing native FLAG blocks NATIVE_REVIEWED even when two others agree, until the flagger decides again", () => {
    let it = lemma();
    it = appendDecision(it, d("n1", {}));
    it = appendDecision(it, { ...d("n2", { action: "FLAG" }), verdict: "UNKNOWN" });
    expect(itemState(it).status).toBe("FLAGGED");
    it = appendDecision(it, d("n3", {}));
    expect(itemState(it).status).toBe("FLAGGED");
    it = appendDecision(it, d("n2", { action: "ACCEPT", note: "checked with a dictionary" })); // history keeps the flag
    expect(itemState(it).status).toBe("NATIVE_REVIEWED");
    expect(it.decisions.filter((x) => x.reviewerId === "n2")).toHaveLength(2);
  });
  it("a FLAG from an engineer or a model never creates a native status", () => {
    const it = appendDecision(lemma(), { ...d("e1", { action: "FLAG" }, "ENGINEER_HUMAN"), verdict: "UNKNOWN" });
    expect(itemState(it).status).toBe("ENGINEER_REVIEWED");
  });
});

describe("lemma corrections and paradigm forms", () => {
  it("two natives must agree on a corrected record; different corrections are DISPUTED", () => {
    let a = appendDecision(lemma(), d("n1", { action: "CORRECT", lemmaCorrection: { pos: "ADJ", flags: ["no-plural"] } }));
    a = appendDecision(a, d("n2", { action: "CORRECT", lemmaCorrection: { pos: "ADJ", flags: ["no-plural"] } }));
    expect(itemState(a).status).toBe("NATIVE_REVIEWED");
    expect(itemState(a).lemmaCorrection).toEqual({ pos: "ADJ", flags: ["no-plural"] });
    let b = appendDecision(lemma(), d("n1", { action: "CORRECT", lemmaCorrection: { pos: "ADJ" } }));
    b = appendDecision(b, d("n2", {})); // accepts as proposed
    expect(itemState(b).status).toBe("DISPUTED");
  });
  it("a form is reviewed only when ≥2 natives judged it the same way; one-sided forms stay pending", () => {
    let it = appendDecision(lemma(), d("n1", { forms: [{ form: "номын", valid: true }, { form: "номийн", valid: false }, { form: "номоор", valid: true }] }));
    expect(itemState(it).status).toBe("NATIVE_PENDING");
    expect(itemState(it).pendingForms).toHaveLength(3);
    it = appendDecision(it, d("n2", { forms: [{ form: "номын", valid: true }, { form: "номийн", valid: false }] }));
    const st = itemState(it);
    expect(st.status).toBe("NATIVE_REVIEWED");
    expect(st.reviewedForms).toEqual([{ form: "номийн", valid: false }, { form: "номын", valid: true }]);
    expect(st.pendingForms).toEqual([{ form: "номоор", valid: true }]);
  });
  it("two natives who judge one form in opposite ways are DISPUTED, never merged", () => {
    let it = appendDecision(lemma(), d("n1", { forms: [{ form: "номууд", valid: true }] }));
    it = appendDecision(it, d("n2", { forms: [{ form: "номууд", valid: false }] }));
    expect(itemState(it).status).toBe("DISPUTED");
  });
  it("rejects malformed forms, duplicates, and forms on a non-VALID verdict", () => {
    expect(validateDecision(d("n1", { forms: [{ form: "ном ын", valid: true }] }))).not.toEqual([]);
    expect(validateDecision(d("n1", { forms: [{ form: "номын", valid: true }, { form: "НОМЫН", valid: false }] }))).not.toEqual([]);
    expect(validateDecision({ ...d("n1", { forms: [{ form: "номын", valid: true }] }), verdict: "MISSPELLED" })).not.toEqual([]);
  });
  it("engineer / model form judgments are never reviewed forms", () => {
    const it = appendDecision(lemma(), d("e1", { forms: [{ form: "номын", valid: true }] }, "ENGINEER_HUMAN"));
    expect(itemState(it).reviewedForms).toBeUndefined();
    expect(paradigmGold([it])).toEqual([]);
  });
});

describe("gold filing", () => {
  it("a flagged item is filed as a candidate, never as native gold", () => {
    expect(dirFor("FLAGGED")).toBe("model");
    expect(dirFor("NATIVE_REVIEWED")).toBe("native");
  });
});

describe("TSV round trip carries the new columns", () => {
  it("exports the columns and imports action, FLAG, corrected POS/flags and forms", () => {
    const items = [lemma("ном"), lemma("цонх")];
    const tsv = exportQueueTsv(items);
    const header = tsv.split("\n")[0]!.split("\t");
    for (const c of ["action", "lemmaPos", "lemmaFlags", "validForms", "invalidForms"]) expect(header).toContain(c);
    const row = (id: string, cells: Record<string, string>) => header.map((h) => (h === "id" ? id : cells[h] ?? "")).join("\t");
    const filled = [header.join("\t"), row(items[0]!.id, { decision: "VALID", validForms: "номын; номд", invalidForms: "номийн", lemmaPos: "N" }), row(items[1]!.id, { decision: "FLAG", note: "ask a second linguist" })].join("\n");
    const r = importDecisionsTsv(items, filled, { id: "n1", kind: "NATIVE_HUMAN" }, at);
    expect(r.applied).toBe(2);
    const [a, b] = r.items;
    expect(a!.decisions[0]!.forms).toEqual([{ form: "номын", valid: true }, { form: "номд", valid: true }, { form: "номийн", valid: false }]);
    expect(a!.decisions[0]!.lemmaCorrection).toEqual({ pos: "N" });
    expect(itemState(b!).status).toBe("FLAGGED");
    expect(summarize(r.items).FLAGGED).toBe(1);
    expect(reviewQueue(r.items).map((x) => x.token)).toContain("цонх"); // flagged items stay in the queue
  });
  it("a file can never promote itself: the caller supplies the reviewer kind", () => {
    const items = [lemma()];
    const header = exportQueueTsv(items).split("\n")[0]!.split("\t");
    const filled = [header.join("\t"), header.map((h) => (h === "id" ? items[0]!.id : h === "decision" ? "VALID" : h === "validForms" ? "номын" : "")).join("\t")].join("\n");
    const r = importDecisionsTsv(items, filled, { id: "claude", kind: "MODEL_ASSISTANT" }, at);
    expect(itemState(r.items[0]!).status).toBe("MODEL_ADJUDICATED");
    expect(itemState(r.items[0]!).reviewedForms).toBeUndefined();
  });
});

describe("paradigm gold and the engine audit", () => {
  const reviewed = (forms: { form: string; valid: boolean }[]) => {
    let it = appendDecision(lemma(), d("n1", { forms }));
    it = appendDecision(it, d("n2", { forms }));
    return it;
  };
  it("only NATIVE_REVIEWED forms become gold", () => {
    const gold = paradigmGold([reviewed([{ form: "номын", valid: true }, { form: "номийн", valid: false }]), appendDecision(lemma("цонх"), d("n1", { forms: [{ form: "цонхны", valid: true }] }))]);
    expect(gold.map((g) => `${g.form}:${g.valid}`).sort()).toEqual(["номийн:false", "номын:true"]);
  });
  it("names false accepts, false rejects and coverage gaps separately", () => {
    const gold = paradigmGold([reviewed([{ form: "а", valid: true }, { form: "б", valid: true }, { form: "в", valid: true }, { form: "г", valid: false }, { form: "д", valid: false }, { form: "е", valid: false }])]);
    const verdict = { а: "VALID", б: "MISSPELLED", в: "UNKNOWN", г: "VALID", д: "MISSPELLED", е: "UNKNOWN" } as const;
    const r = paradigmAudit(gold, (f) => verdict[f as keyof typeof verdict]);
    expect(r.forms).toBe(6);
    expect(r.agree).toBe(3);
    expect(r.falseReject.map((x) => x.form)).toEqual(["б"]);
    expect(r.coverageGap.map((x) => x.form)).toEqual(["в"]);
    expect(r.falseAccept.map((x) => x.form)).toEqual(["г"]);
  });
});
