import { describe, expect, it } from "vitest";
import {
  appendDecision, buildQueues, createSpellEngineV1, exportMorphologySheet, exportQueueTsv, goldStats, impactScore, importDecisionsTsv, importMorphologySheet, itemState,
  maxCoverageGain, paradigmAudit, paradigmGold, queueToReviewItems, queuesOf, QUEUE_IDS, REVIEW_SHEET_BANNER, summarizeReview, validateDecision, withEnginePredictions,
  type QueueCandidate, type SpellReviewItem,
} from "@/spell-engine";

/**
 * Reviewer ids here (n1, n2, n3 …) are TEST FIXTURES for the consensus rules. They represent no real review: native-reviewed data in the
 * repository is still 0, and nothing in this file may be copied into gold/native.
 */
const lemma = (token = "багш"): SpellReviewItem => ({
  schema: "tore-spell-review/1", id: `LEMMA:GENERAL:N:${token}`, datasetVersion: "test", token, sentenceOrigin: "NONE", category: "VALID", currentVerdict: "VALID",
  source: "test", provenance: "MODEL_ASSISTANT", lemma: { pos: "N", domain: "GENERAL", kind: "COMMON", confidence: "MEDIUM", origin: "test" }, decisions: [],
});
const at = "2026-10-08T00:00:00Z";
const nat = (reviewerId: string, extra: object = {}) => ({ reviewerId, reviewerKind: "NATIVE_HUMAN" as const, verdict: "VALID" as const, at, ...extra });
const forms = (...f: [string, boolean][]) => ({ forms: f.map(([form, valid]) => ({ form, valid })) });

describe("adjudication: a dispute is resolved only by an explicit, reasoned, additional native decision", () => {
  const disputed = () => appendDecision(appendDecision(lemma(), nat("n1", forms(["багшыг", true]))), nat("n2", forms(["багшыг", false])));
  it("two natives who contradict each other are DISPUTED and stay out of gold", () => {
    expect(itemState(disputed()).status).toBe("DISPUTED");
    expect(goldStats([disputed()]).nativeReviewed).toBe(0);
  });
  it("a third native who agrees with one side AND records a reason resolves it; the overruled reviewer stays on record", () => {
    const it = appendDecision(disputed(), nat("n3", { ...forms(["багшыг", false]), adjudication: { reason: "checked against the orthography standard" } }));
    const st = itemState(it);
    expect(st.status).toBe("NATIVE_REVIEWED");
    expect(st.reviewedForms).toEqual([{ form: "багшыг", valid: false }]);
    expect(st.resolution).toMatchObject({ resolverId: "n3", agreedWith: ["n2"], overruled: ["n1"], reason: "checked against the orthography standard" });
    expect(it.decisions).toHaveLength(3); // nothing was removed or rewritten
  });
  it("a third native WITHOUT the adjudication marker does not resolve it (no silent majority)", () => {
    const it = appendDecision(disputed(), nat("n3", forms(["багшыг", false])));
    expect(itemState(it).status).toBe("DISPUTED");
  });
  it("an adjudicator who agrees with nobody leaves it DISPUTED", () => {
    const it = appendDecision(disputed(), nat("n3", { ...forms(["багшыг", true]), lemmaCorrection: { pos: "ADJ" }, adjudication: { reason: "a third view" } }));
    expect(itemState(it).status).toBe("DISPUTED");
  });
  it("adjudication needs a reason and a native", () => {
    expect(validateDecision(nat("n3", { adjudication: { reason: "  " } }))).not.toEqual([]);
    expect(validateDecision({ ...nat("e1", { adjudication: { reason: "x" } }), reviewerKind: "ENGINEER_HUMAN" })).not.toEqual([]);
    expect(validateDecision({ ...nat("m1", { adjudication: { reason: "x" } }), reviewerKind: "MODEL_ASSISTANT" })).not.toEqual([]);
  });
  it("a model can never adjudicate a native dispute (it simply does not count)", () => {
    const it = appendDecision(disputed(), { reviewerId: "assistant", reviewerKind: "MODEL_ASSISTANT", verdict: "VALID", at });
    expect(itemState(it).status).toBe("DISPUTED");
  });
});

describe("«uncertain» forms never count as a vote", () => {
  it("a FLAGged form stays pending even when both natives flag it; other forms still agree", () => {
    const f = (v: boolean) => ({ forms: [{ form: "багшийг", valid: true }, { form: "багшыг", valid: false, uncertain: true }].map((x) => (x.uncertain ? x : { ...x, valid: v })) });
    const it = appendDecision(appendDecision(lemma(), nat("n1", f(true))), nat("n2", f(true)));
    const st = itemState(it);
    expect(st.status).toBe("NATIVE_REVIEWED");
    expect(st.reviewedForms).toEqual([{ form: "багшийг", valid: true }]);
    expect(st.pendingForms).toEqual([{ form: "багшыг", valid: false, uncertain: true }]);
  });
});

describe("engine predictions are an immutable audit record, separate from judgments", () => {
  const engine = createSpellEngineV1();
  const verdictOf = (f: string) => engine.analyze(`Энэ ${f} нь`).tokens[1]!.verdict;
  it("are attached once and never overwritten", () => {
    const a = withEnginePredictions(lemma(), ["багшийг", "багшыг", "багшыг"], verdictOf, "v-test");
    expect(a.enginePredictions?.map((p) => p.form)).toEqual(["багшийг", "багшыг"]);
    const b = withEnginePredictions(a, ["багшид"], () => "UNKNOWN", "v-other");
    expect(b.enginePredictions).toEqual(a.enginePredictions);
  });
  it("a judgment never edits the prediction", () => {
    const a = withEnginePredictions(lemma(), ["багшыг"], verdictOf, "v-test");
    const b = appendDecision(a, nat("n1", forms(["багшыг", false])));
    expect(b.enginePredictions).toEqual(a.enginePredictions);
  });
  it("REGRESSION SHAPE: engine accepts «багшыг»; two (fixture) natives call it invalid → native-reviewed INVALID, audit names a FALSE ACCEPT", () => {
    const it = appendDecision(appendDecision(withEnginePredictions(lemma(), ["багшийг", "багшыг"], verdictOf, "v-test"), nat("n1", forms(["багшийг", true], ["багшыг", false]))), nat("n2", forms(["багшийг", true], ["багшыг", false])));
    const gold = paradigmGold([it]);
    expect(gold.map((g) => `${g.form}:${g.valid}`).sort()).toEqual(["багшийг:true", "багшыг:false"]);
    const audit = paradigmAudit(gold, verdictOf);
    // This is the engine's CURRENT behaviour; if a future change makes it reject «багшыг», this assertion is the one to update on purpose.
    expect(verdictOf("багшыг")).toBe("VALID");
    expect(audit.falseAccept.map((g) => g.form)).toEqual(["багшыг"]);
    expect(audit.agree).toBe(1);
  });
});

describe("morphology sheet: lemma decision first, per-form judgment, engine column separate", () => {
  const withPreds = () => withEnginePredictions(lemma(), ["багшийг", "багшыг", "багшид"], () => "VALID", "v-test");
  it("exports the banner, the engine column, and no pre-filled decision", () => {
    const tsv = exportMorphologySheet([withPreds()]);
    for (const line of REVIEW_SHEET_BANNER) expect(tsv).toContain(line);
    const rows = tsv.split("\n").filter((l) => !l.startsWith("#") && l.length).map((l) => l.split("\t"));
    expect(rows[0]).toEqual(["id", "lemma", "pos", "form", "engineSays", "lemmaDecision", "judgment", "note"]);
    for (const r of rows.slice(1)) expect([r[5], r[6]]).toEqual(["", ""]);
  });
  it("imports VALID / INVALID / FLAG per form and keeps the reviewer kind from the caller", () => {
    const tsv = exportMorphologySheet([withPreds()]).split("\n").map((l) => {
      const f = l.split("\t");
      if (f[0] !== lemma().id) return l;
      f[5] = f[3] === "багшийг" ? "VALID" : "";
      f[6] = ({ багшийг: "VALID", багшыг: "INVALID", багшид: "FLAG" } as Record<string, string>)[f[3]!] ?? "";
      return f.join("\t");
    }).join("\n");
    const r = importMorphologySheet([withPreds()], tsv, { id: "n1", kind: "NATIVE_HUMAN" }, at);
    expect(r.applied).toBe(1);
    const d = r.items[0]!.decisions[0]!;
    expect(d.forms).toEqual([{ form: "багшийг", valid: true }, { form: "багшыг", valid: false }, { form: "багшид", valid: false, uncertain: true }]);
    expect(itemState(r.items[0]!).status).toBe("NATIVE_PENDING");
    const asModel = importMorphologySheet([withPreds()], tsv, { id: "claude", kind: "MODEL_ASSISTANT" }, at);
    expect(itemState(asModel.items[0]!).status).toBe("MODEL_ADJUDICATED");
  });
  it("skips forms judged without a lemma decision instead of assuming the lemma is fine", () => {
    const tsv = exportMorphologySheet([withPreds()]).split("\n").map((l) => { const f = l.split("\t"); if (f[0] === lemma().id) f[6] = "VALID"; return f.join("\t"); }).join("\n");
    const r = importMorphologySheet([withPreds()], tsv, { id: "n1", kind: "NATIVE_HUMAN" }, at);
    expect(r.applied).toBe(0);
    expect(r.skipped[0]!.reason).toMatch(/without a lemmaDecision/);
  });
  it("the plain review sheet also ignores comment lines and cannot promote itself", () => {
    const items = [lemma()];
    const sheet = exportQueueTsv(items);
    expect(sheet.startsWith("# ")).toBe(true);
    expect(sheet).toMatch(/release-grade only after the required native-review agreement/);
    const r = importDecisionsTsv(items, sheet.replace(/\n$/, "") , { id: "n1", kind: "NATIVE_HUMAN" }, at);
    expect(r.applied).toBe(0); // nothing filled in → nothing recorded
  });
});

describe("gold statistics are honest about what is not measurable", () => {
  it("rates are null (NOT MEASURED) with an empty denominator, never 0 or 1", () => {
    const s = goldStats([lemma("а"), lemma("б")]);
    expect(s.nativeReviewed).toBe(0);
    expect(s.agreementRate).toBeNull();
    expect(s.resolutionRate).toBeNull();
  });
  it("counts agreement, disagreement, resolution and reviewed forms", () => {
    const agreed = appendDecision(appendDecision(lemma("а"), nat("n1", forms(["аа", true]))), nat("n2", forms(["аа", true])));
    const disputed = appendDecision(appendDecision(lemma("б"), nat("n1", forms(["бб", true]))), nat("n2", forms(["бб", false])));
    const resolved = appendDecision(appendDecision(appendDecision(lemma("в"), nat("n1", forms(["вв", true]))), nat("n2", forms(["вв", false]))), nat("n3", { ...forms(["вв", true]), adjudication: { reason: "r" } }));
    const s = goldStats([agreed, disputed, resolved]);
    expect(s).toMatchObject({ nativeReviewed: 2, disputed: 1, adjudicated: 1, twoNativeItems: 3 });
    expect(s.agreementRate).toBeCloseTo(1 / 3);
    expect(s.resolutionRate).toBeCloseTo(1 / 2);
    expect(s.reviewedForms).toEqual({ valid: 2, invalid: 0 });
    expect(summarizeReview([agreed, disputed, resolved]).DISPUTED).toBe(1);
  });
});

describe("impact scoring and review queues are deterministic and explain themselves", () => {
  const c = (token: string, o: Partial<QueueCandidate> = {}): QueueCandidate => ({ token, occurrences: 100, documents: 50, category: "MISSING_LEMMA", engineVerdict: "UNKNOWN", fanOut: 0, professionalShare: 0, secondOpinion: "ACCEPTS", ...o });
  it("score is the documented sum, with reasons", () => {
    const { score, reasons } = impactScore(c("х", { occurrences: 1000, documents: 100, fanOut: 10, professionalShare: 0.5 }));
    expect(score).toBe((1000 + 2 * 100 + 5 * 10) * 1.25);
    expect(reasons).toEqual(["1,000 UNKNOWN occurrences", "100 documents affected", "10 other observed forms of the same stem", "50% of occurrences in legal/government/business documents"]);
  });
  it("an accused word gets the accusation weight and says why", () => {
    const { score, reasons } = impactScore(c("х", { engineVerdict: "MISSPELLED", occurrences: 10, documents: 1 }));
    expect(score).toBeCloseTo((10 + 2) * 1.1, 6);
    expect(reasons.join(" ")).toMatch(/accuses this word/);
  });
  it("orders by score, then by token; the same input always yields byte-identical queues, in any input order", () => {
    const cands = [c("б", { occurrences: 50 }), c("а", { occurrences: 50 }), c("в", { occurrences: 500 }), c("г", { occurrences: 5, documents: 900 })];
    const q1 = buildQueues({ candidates: cands });
    const q2 = buildQueues({ candidates: [...cands].reverse() });
    expect(JSON.stringify(q2)).toBe(JSON.stringify(q1));
    expect(q1.HIGH_IMPACT_MISSING_LEMMAS.map((x) => x.token)).toEqual(["г", "в", "а", "б"]);
    expect(q1.HIGH_IMPACT_MISSING_LEMMAS.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });
  it("routes candidates to explicit queues and never mixes them into one list", () => {
    expect(queuesOf(c("а"))).toEqual(["HIGH_FREQUENCY_UNKNOWN", "HIGH_IMPACT_MISSING_LEMMAS"]);
    expect(queuesOf(c("а", { secondOpinion: "REJECTS" }))).toEqual(["HIGH_FREQUENCY_UNKNOWN"]);
    expect(queuesOf(c("а", { category: "PROPER_NAME" }))).toContain("PROPER_NAMES");
    expect(queuesOf(c("а", { category: "LOANWORD" }))).toContain("LOANWORDS");
    expect(queuesOf(c("а", { category: "COMPOUND" }))).toContain("COMPOUNDS");
    expect(queuesOf(c("а", { category: "DERIVATIONAL_FORM" }))).toContain("DERIVATIONS");
    expect(queuesOf(c("а", { professionalShare: 0.6 }))).toContain("LEGAL_GOVERNMENT");
    expect(queuesOf(c("а", { engineVerdict: "MISSPELLED" }))).toEqual(["POSSIBLE_FALSE_POSITIVE"]);
    expect(queuesOf(c("а", { engineVerdict: "VALID" }))).toEqual([]);
    expect(queuesOf(c("а", { category: "TOKENIZER_FAILURE" }))).toEqual([]);
    expect(QUEUE_IDS).toHaveLength(12);
  });
  it("disputed and flagged items form their own queue; native-reviewed items form the regression queue", () => {
    const dis = appendDecision(appendDecision(lemma("а"), nat("n1", forms(["аа", true]))), nat("n2", forms(["аа", false])));
    const ok = appendDecision(appendDecision(lemma("б"), nat("n1")), nat("n2"));
    const flag = appendDecision(lemma("в"), { ...nat("n1", { action: "FLAG" }), verdict: "UNKNOWN" });
    const q = buildQueues({ candidates: [], gold: [dis, ok, flag] });
    expect(q.DISPUTED_ITEMS.map((x) => x.token).sort()).toEqual(["а", "в"]);
    expect(q.REVIEWED_REGRESSION.map((x) => x.token)).toEqual(["б"]);
  });
  it("exports queue entries as ordinary review items (provenance AUTOMATIC, no pre-filled decision, score kept beside the decision columns)", () => {
    const q = buildQueues({ candidates: [c("а", { occurrences: 7 })] });
    const items = queueToReviewItems(q.HIGH_IMPACT_MISSING_LEMMAS, { engineVersion: "v-test", at });
    expect(items[0]!.provenance).toBe("AUTOMATIC");
    expect(itemState(items[0]!).status).toBe("AUTO_GENERATED");
    expect(items[0]!.currentReason).toMatch(/score .*7 UNKNOWN occurrences/);
    expect(exportQueueTsv(items)).toMatch(/AUTO|UNKNOWN/);
    const back = importDecisionsTsv(items, exportQueueTsv(items), { id: "x", kind: "NATIVE_HUMAN" }, at);
    expect(back.applied).toBe(0);
  });
  it("max coverage is an explicit upper-bound share of all tokens", () => {
    const items = [{ occurrences: 300 }, { occurrences: 200 }, { occurrences: 100 }];
    expect(maxCoverageGain(items, 2, 10_000)).toBe(5);
    expect(maxCoverageGain(items, 99, 10_000)).toBe(6);
    expect(maxCoverageGain(items, 2, 0)).toBe(0);
  });
});

describe("provenance and promotion rules still hold", () => {
  it("engine / model / engineer judgments never reach NATIVE_REVIEWED, in any number", () => {
    let it = lemma();
    for (const k of ["MODEL_ASSISTANT", "ENGINEER_HUMAN", "AUTOMATIC"] as const) for (const id of ["a", "b", "c"]) it = appendDecision(it, { reviewerId: `${k}-${id}`, reviewerKind: k, verdict: "VALID", at });
    expect(itemState(it).status).not.toBe("NATIVE_REVIEWED");
    expect(goldStats([it]).nativeReviewed).toBe(0);
  });
  it("the same reviewer twice counts once", () => {
    let it = appendDecision(lemma(), nat("n1"));
    it = appendDecision(it, nat("n1"));
    expect(itemState(it).status).toBe("NATIVE_PENDING");
  });
});
