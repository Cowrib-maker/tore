import { describe, expect, it } from "vitest";
import {
  REVIEW_SCHEMA, appendDecision, exportQueueTsv, importDecisionsTsv, isNativeGold, itemState, reviewQueue, summarizeReview, validateItem,
  type SpellReviewItem,
} from "../../src/spell-engine";

const base = (id: string, extra: Partial<SpellReviewItem> = {}): SpellReviewItem => ({
  schema: REVIEW_SCHEMA, id, datasetVersion: "spell-gold-v3.0", token: "надэд", sentence: "Энэ надэд хэрэгтэй.", sentenceOrigin: "MODEL_AUTHORED",
  category: "MISSPELLED", currentVerdict: "MISSPELLED", currentSuggestion: "надад", currentReason: "HARMONY_VIOLATION_NEIGHBOR",
  source: "unit-test", provenance: "MODEL_ASSISTANT", decisions: [], ...extra,
});
const d = (reviewerId: string, reviewerKind: "NATIVE_HUMAN" | "ENGINEER_HUMAN" | "MODEL_ASSISTANT" | "AUTOMATIC", verdict: "VALID" | "MISSPELLED" | "UNKNOWN", suggestion?: string) => ({ reviewerId, reviewerKind, verdict, suggestion, at: "2026-10-08T10:00:00Z" });

describe("review consensus never inflates trust", () => {
  it("a model judgment is MODEL_ADJUDICATED, never gold", () => {
    const it1 = appendDecision(base("a"), d("claude-assistant", "MODEL_ASSISTANT", "MISSPELLED", "надад"));
    expect(itemState(it1).status).toBe("MODEL_ADJUDICATED");
    expect(isNativeGold(it1)).toBe(false);
  });
  it("any number of model/engineer judgments never makes native gold", () => {
    let i = base("b");
    for (const r of ["m1", "m2", "m3"]) i = appendDecision(i, d(r, "MODEL_ASSISTANT", "VALID"));
    for (const r of ["e1", "e2"]) i = appendDecision(i, d(r, "ENGINEER_HUMAN", "VALID"));
    expect(itemState(i).status).toBe("ENGINEER_REVIEWED");
    expect(isNativeGold(i)).toBe(false);
  });
  it("one native is pending; two agreeing distinct natives are NATIVE_REVIEWED; the same native twice is still one", () => {
    let i = appendDecision(base("c"), d("n1", "NATIVE_HUMAN", "MISSPELLED", "надад"));
    expect(itemState(i).status).toBe("NATIVE_PENDING");
    i = appendDecision(i, d("n1", "NATIVE_HUMAN", "MISSPELLED", "надад"));
    expect(itemState(i).status).toBe("NATIVE_PENDING");
    i = appendDecision(i, d("n2", "NATIVE_HUMAN", "MISSPELLED", "надад"));
    expect(itemState(i).status).toBe("NATIVE_REVIEWED");
    expect(isNativeGold(i)).toBe(true);
  });
  it("natives who disagree (verdict, or the correction) are DISPUTED, never resolved silently", () => {
    let i = appendDecision(base("d"), d("n1", "NATIVE_HUMAN", "MISSPELLED", "надад"));
    i = appendDecision(i, d("n2", "NATIVE_HUMAN", "VALID"));
    expect(itemState(i).status).toBe("DISPUTED");
    let j = appendDecision(base("d2"), d("n1", "NATIVE_HUMAN", "MISSPELLED", "надад"));
    j = appendDecision(j, d("n2", "NATIVE_HUMAN", "MISSPELLED", "нэдэд"));
    expect(itemState(j).status).toBe("DISPUTED");
  });
  it("a reviewer may correct themselves, but the history is kept (append-only) and the input is never mutated", () => {
    const i0 = base("e");
    const i1 = appendDecision(i0, d("n1", "NATIVE_HUMAN", "VALID"));
    const i2 = appendDecision(i1, d("n1", "NATIVE_HUMAN", "MISSPELLED", "надад"));
    expect(i0.decisions).toHaveLength(0);
    expect(i1.decisions).toHaveLength(1);
    expect(i2.decisions.map((x) => x.verdict)).toEqual(["VALID", "MISSPELLED"]);
    expect(itemState(i2).verdict).toBe("MISSPELLED");
  });
  it("rejects invalid decisions (suggestion without MISSPELLED, model posing as a human id, bad date)", () => {
    expect(() => appendDecision(base("f"), d("n1", "NATIVE_HUMAN", "VALID", "x"))).toThrow();
    expect(() => appendDecision(base("f"), d("native-reviewer-1", "MODEL_ASSISTANT", "VALID"))).toThrow();
    expect(() => appendDecision(base("f"), { ...d("n1", "NATIVE_HUMAN", "VALID"), at: "yesterday" })).toThrow();
  });
});

describe("items, queue, export / import", () => {
  it("validates item shape; a sentence must contain its token and name its origin", () => {
    expect(validateItem(base("g"))).toEqual([]);
    expect(validateItem(base("g", { sentence: "Энэ нэг өгүүлбэр." })).join()).toMatch(/contain the token/);
    expect(validateItem(base("g", { sentenceOrigin: "NONE" })).join()).toMatch(/sentenceOrigin/);
  });
  it("the queue is priority-ordered and drops only natively-reviewed items; disputed items stay", () => {
    const a = base("a", { priority: 1 });
    const b = base("b", { priority: 9 });
    let c = base("c", { priority: 5 });
    c = appendDecision(appendDecision(c, d("n1", "NATIVE_HUMAN", "VALID")), d("n2", "NATIVE_HUMAN", "VALID"));
    let x = base("x", { priority: 2 });
    x = appendDecision(appendDecision(x, d("n1", "NATIVE_HUMAN", "VALID")), d("n2", "NATIVE_HUMAN", "MISSPELLED", "y"));
    expect(reviewQueue([a, b, c, x]).map((i) => i.id)).toEqual(["b", "x", "a"]);
  });
  it("never exports local-corpus (class D) sentences", () => {
    const tsv = exportQueueTsv([base("h", { sentenceOrigin: "LOCAL_CORPUS_D" }), base("i")]);
    expect(tsv).not.toMatch(/Энэ надэд хэрэгтэй\.\t.*\n.*h/);
    const rows = tsv.trim().split("\n").filter((l) => !l.startsWith("#")).slice(1).map((l) => l.split("\t"));
    expect(rows[0]![3]).toBe("");
    expect(rows[1]![3]).toBe("Энэ надэд хэрэгтэй.");
  });
  it("imports a filled sheet: the CALLER decides the reviewer kind; blank / unknown / invalid rows are reported, never guessed", () => {
    const items = [base("a"), base("b"), base("c")];
    const tsv = ["id\tcategory\ttoken\tsentence\tengineVerdict\tengineSuggestion\tengineReason\tproposedVerdict\tproposedSuggestion\tdecision\tcorrection\tnote", "a\t\t\t\t\t\t\t\t\tmisspelled\tнадад\tok", "b\t\t\t\t\t\t\t\t\t\t\t", "zz\t\t\t\t\t\t\t\t\tvalid\t\t", "c\t\t\t\t\t\t\t\t\tmaybe\t\t"].join("\n");
    const r = importDecisionsTsv(items, tsv, { id: "eng-1", kind: "ENGINEER_HUMAN" }, "2026-10-08T10:00:00Z");
    expect(r.applied).toBe(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(["unknown id zz", 'invalid decision "MAYBE"']);
    expect(itemState(r.items.find((i) => i.id === "a")!)).toMatchObject({ status: "ENGINEER_REVIEWED", verdict: "MISSPELLED", suggestion: "надад" });
    expect(summarizeReview(r.items)).toMatchObject({ total: 3, ENGINEER_REVIEWED: 1, UNREVIEWED: 2, NATIVE_REVIEWED: 0 });
  });
});

import { readReviewedLemmas } from "../../scripts/spell-data/lib/reviewed";
describe("REVIEWED tier cannot be smuggled in", () => {
  const lemmaItem = (word: string): SpellReviewItem => base(`LEMMA:GENERAL:N:${word}`, { token: word, sentence: undefined, sentenceOrigin: "NONE", category: "VALID", currentVerdict: "VALID", lemma: { pos: "N", domain: "GENERAL", kind: "COMMON", confidence: "MEDIUM", origin: "test" } });
  it("accepts a lemma only with two agreeing natives; refuses model-only, engineer-only, one native, or an unknown line", () => {
    const ok = appendDecision(appendDecision(lemmaItem("хэрэг"), d("n1", "NATIVE_HUMAN", "VALID")), d("n2", "NATIVE_HUMAN", "VALID"));
    const one = appendDecision(lemmaItem("нэг"), d("n1", "NATIVE_HUMAN", "VALID"));
    const eng = appendDecision(appendDecision(lemmaItem("хоёр"), d("e1", "ENGINEER_HUMAN", "VALID")), d("e2", "ENGINEER_HUMAN", "VALID"));
    const items = [ok, one, eng, appendDecision(lemmaItem("гурав"), d("m", "MODEL_ASSISTANT", "VALID"))];
    expect(readReviewedLemmas("# c\nхэрэг\tN\t\tGENERAL\n", items)).toEqual([{ w: "хэрэг", pos: "N", flags: undefined, domain: "GENERAL" }]);
    for (const w of ["нэг", "хоёр", "гурав", "тодорхойгүй"]) expect(() => readReviewedLemmas(`${w}\tN\t\tGENERAL\n`, items), w).toThrow(/not backed by a NATIVE_REVIEWED/);
  });
});
