/**
 * Language Engine V1 benchmark core. Pure function of (engine, datasets) →
 * report; used by `scripts/benchmark-spell-engine.ts` (printing) and by the
 * precision-gate tests (assertions).
 */
import fs from "node:fs";
import path from "node:path";
import { buildOrthographySuggestions } from "../../../src/domain/mongolian-orthography";
import { BUNDLED_PACKS, BUNDLED_TYPO_PAIRS, createSpellEngineV1, type SpellEngineV1 } from "../../../src/spell-engine";
import { fBeta, injectError, mrr, mulberry32, percentile, precision, recall, topK, type Confusion, type ErrorKind } from "../../../src/spell-engine/evaluation/metrics";
import { DANGEROUS_PAIRS, GOLD_CASES } from "./gold-adapter";
import { engineForRecord, loadNativeReviewed, loadVerbGoldDraft, runRegression, satisfies, type GoldRecord } from "./gold-loader";
import { runMutationSuite } from "./mutation";

const DIR = __dirname;

export function loadCleanLines(): string[] {
  return fs
    .readFileSync(path.join(DIR, "clean-text.txt"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"));
}

type Paradigms = {
  paradigms: { lemma: string; valid: string[]; invalid: { form: string; fix: string }[] }[];
  protected: string[];
};
export function loadParadigms(): Paradigms {
  return JSON.parse(fs.readFileSync(path.join(DIR, "paradigms.json"), "utf8")) as Paradigms;
}

export type Report = ReturnType<typeof runBenchmark>;

export function runBenchmark(engine: SpellEngineV1, opts: { seed?: number; samples?: number } = {}) {
  const seed = opts.seed ?? 20261005;
  const samples = opts.samples ?? 4000;

  // ── A. clean-text false positives ──────────────────────────────────────
  const lines = loadCleanLines();
  let words = 0;
  let fp = 0;
  let unknown = 0;
  let valid = 0;
  const fpWords: string[] = [];
  for (const line of lines) {
    const r = engine.analyze(line);
    words += r.stats.wordCount;
    unknown += r.stats.unknownCount;
    valid += r.stats.validCount;
    for (const i of r.issues) {
      if (i.verdict === "MISSPELLED") {
        fp += 1;
        fpWords.push(i.token);
      }
    }
  }
  const clean = {
    lines: lines.length,
    words,
    falsePositives: fp,
    fpPer1000Words: words === 0 ? 0 : (fp / words) * 1000,
    unknownRate: words === 0 ? 0 : unknown / words,
    validRate: words === 0 ? 0 : valid / words,
    fpWords,
  };

  // ── B. paradigms (task examples) ───────────────────────────────────────
  const par = loadParadigms();
  let pValid = 0;
  let pAccepted = 0;
  let pFalseMiss = 0;
  const pRejected: string[] = [];
  let invTotal = 0;
  let invFlagged = 0;
  let invTop1 = 0;
  const invWrongFix: string[] = [];
  for (const p of par.paradigms) {
    for (const f of p.valid) {
      pValid += 1;
      const a = engine.checkWord(f);
      if (a.verdict === "VALID") pAccepted += 1;
      else pRejected.push(f);
      if (a.verdict === "MISSPELLED") pFalseMiss += 1;
    }
    for (const inv of p.invalid) {
      invTotal += 1;
      const a = engine.checkWord(inv.form);
      if (a.verdict === "MISSPELLED") {
        invFlagged += 1;
        if (a.issue?.suggestions[0]?.text === inv.fix) invTop1 += 1;
        else invWrongFix.push(`${inv.form}→${a.issue?.suggestions[0]?.text}`);
      }
    }
  }
  let protTotal = 0;
  let protBad = 0;
  const protBadList: string[] = [];
  for (const t of par.protected) {
    protTotal += 1;
    const r = engine.analyze(t);
    if (r.issues.some((i) => i.verdict === "MISSPELLED")) {
      protBad += 1;
      protBadList.push(t);
    }
  }
  const paradigms = {
    validForms: pValid,
    acceptedAsValid: pAccepted,
    acceptanceRate: pValid ? pAccepted / pValid : 0,
    falseMisspelled: pFalseMiss,
    rejected: pRejected,
    invalidForms: invTotal,
    invalidFlagged: invFlagged,
    invalidTop1: invTop1,
    invalidWrongFix: invWrongFix,
    protectedTokens: protTotal,
    protectedFlagged: protBad,
    protectedFlaggedList: protBadList,
  };

  // ── C. synthetic seeded error injection on lexicon words ───────────────
  const rng = mulberry32(seed);
  const kinds: ErrorKind[] = ["DELETE", "TRANSPOSE", "VOWEL_SWAP", "DOUBLE_FINAL", "INSERT"];
  const pool: string[] = [];
  for (const k of engine.lexicon.keys()) {
    const e = engine.lexicon.lookup(k)[0]!;
    if ((e.layer === "GENERAL" || e.layer === "LEGAL") && k.length >= 5 && !e.formOnly) pool.push(k);
  }
  pool.sort();
  const conf: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const ranks: (number | null)[] = [];
  let abstain = 0;
  let injected = 0;
  const perKind: Record<string, { n: number; flagged: number; top1: number }> = {};
  for (let s = 0; s < samples && pool.length > 0; s += 1) {
    const w = pool[Math.floor(rng() * pool.length)]!;
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const bad = injectError(w, kind, rng);
    if (!bad || bad === w || engine.isValid(bad)) continue; // skip no-ops and accidental real words
    injected += 1;
    const a = engine.checkWord(bad);
    const pk = (perKind[kind] ??= { n: 0, flagged: 0, top1: 0 });
    pk.n += 1;
    if (a.verdict === "MISSPELLED") {
      pk.flagged += 1;
      const sug = a.issue?.suggestions.map((x) => x.text) ?? [];
      const idx = sug.indexOf(w);
      ranks.push(idx === -1 ? null : idx + 1);
      if (idx === 0) {
        conf.tp += 1;
        pk.top1 += 1;
      } else conf.fp += 1; // flagged but wrong fix counts against precision of the SUGGESTION
    } else {
      conf.fn += 1;
      if (a.verdict === "UNKNOWN") abstain += 1;
    }
  }
  const synthetic = {
    injected,
    detected: ranks.length,
    detectionRate: injected ? ranks.length / injected : 0,
    suggestionPrecision: precision(conf),
    suggestionRecall: recall(conf),
    f05: fBeta(conf, 0.5),
    top1: topK(ranks, 1),
    top3: topK(ranks, 3),
    mrr: mrr(ranks),
    abstentionRate: injected ? abstain / injected : 0,
    perKind,
  };

  // ── D. legacy gold sets ────────────────────────────────────────────────
  const gold: Record<string, { total: number; ok: number; failures: string[] }> = {};
  const g = (cls: string) => (gold[cls] ??= { total: 0, ok: 0, failures: [] });
  for (const c of GOLD_CASES) {
    const a = engine.checkWord(c.input);
    const bucket = g(c.cls);
    bucket.total += 1;
    if (c.cls === "MISSPELLING") {
      // success = correct top-1 fix; abstaining (UNKNOWN) is safe but not a hit.
      if (a.verdict === "MISSPELLED" && a.issue?.suggestions[0]?.text === c.expected) bucket.ok += 1;
      else bucket.failures.push(`${c.input}→${a.verdict}${a.issue ? ":" + a.issue.suggestions[0]?.text : ""} (want ${c.expected})`);
    } else if (a.verdict !== "MISSPELLED") bucket.ok += 1;
    else bucket.failures.push(`${c.input}→MISSPELLED:${a.issue?.suggestions[0]?.text}`);
  }
  let dangerousFlagged = 0;
  const dangerousList: string[] = [];
  for (const [x, y] of DANGEROUS_PAIRS) {
    for (const w of [x, y]) {
      if (engine.checkWord(w).verdict === "MISSPELLED") {
        dangerousFlagged += 1;
        dangerousList.push(w);
      }
    }
  }

  // ── E. performance ─────────────────────────────────────────────────────
  const sample = [...pool].slice(0, 400);
  const perWord: number[] = [];
  for (const w of sample) {
    const t0 = performance.now();
    engine.checkWord(w + "х");
    perWord.push(performance.now() - t0);
  }
  const bigText = lines.join(" ").repeat(Math.ceil(20_000 / Math.max(1, lines.join(" ").length))).slice(0, 20_000);
  const doc: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now();
    engine.analyze(bigText);
    doc.push(performance.now() - t0);
  }
  const perf = {
    wordP50Ms: percentile(perWord, 50),
    wordP95Ms: percentile(perWord, 95),
    wordP99Ms: percentile(perWord, 99),
    doc20kCharsP50Ms: percentile(doc, 50),
    doc20kCharsMaxMs: Math.max(...doc),
    heapUsedMb: process.memoryUsage().heapUsed / 1024 / 1024,
    lexiconSize: engine.lexicon.size,
  };

  return { engineVersion: engine.engineVersion, dataPackVersion: engine.dataPackVersion, seed, clean, paradigms, synthetic, gold, dangerous: { pairs: DANGEROUS_PAIRS.length, flagged: dangerousFlagged, list: dangerousList }, perf, verbGold: runVerbGold(), regression: runRegression(), mutation: (() => { const m = runMutationSuite({ seed: 20261006, perEntry: 6 }); return { mutated: m.mutated, valid: m.valid, collisions: m.collisions, suspects: m.suspects.length, misspelled: m.misspelled, wrongRepairs: m.wrongRepairs.length, unknown: m.unknown, byKind: m.byKind }; })() };
}

/**
 * VERB_GOLD_DRAFT_V1 (TORE_AUTHORED, AI engineering draft, PENDING_NATIVE_REVIEW).
 * Per expected-kind contract (see gold-loader.ts): VALID → VALID; INVALID → never VALID;
 * VALID_UNSUPPORTED / DERIVATION → UNKNOWN; AMBIGUOUS → never MISSPELLED.
 */
export function runVerbGold() {
  const { doc, records } = loadVerbGoldDraft();
  const engines = new Map<string, ReturnType<typeof engineForRecord>>();
  const engineFor = (r: GoldRecord) => {
    const key = `${r.lemma}|${r.flags.join(",")}`;
    let e = engines.get(key);
    if (!e) engines.set(key, (e = engineForRecord(r)));
    return e;
  };
  const byKind: Record<string, { n: number; ok: number; verdicts: Record<string, number> }> = {};
  const failures: string[] = [];
  const byTag: Record<string, { n: number; ok: number }> = {};
  let falseMisspelled = 0;
  let invalidAsValid = 0;
  const invalidAsValidList: string[] = [];
  let invalidFlagged = 0;
  let confidenceMedium = 0;
  for (const r of records) {
    const v = engineFor(r).checkWord(r.surface).verdict;
    const k = (byKind[r.expected] ??= { n: 0, ok: 0, verdicts: {} });
    k.n += 1;
    k.verdicts[v] = (k.verdicts[v] ?? 0) + 1;
    const ok = satisfies(r.expected, v);
    if (ok) k.ok += 1;
    else failures.push(`${r.lemma}[${r.flags.join(",")}]:${r.surface} expected ${r.expected} got ${v}`);
    if (r.confidence === "MEDIUM") confidenceMedium += 1;
    if (r.expected === "VALID") {
      const t = (byTag[r.tags[0] ?? "?"] ??= { n: 0, ok: 0 });
      t.n += 1;
      if (v === "VALID") t.ok += 1;
      if (v === "MISSPELLED") falseMisspelled += 1;
    }
    if (r.expected === "INVALID") {
      if (v === "VALID") {
        invalidAsValid += 1;
        invalidAsValidList.push(`${r.lemma}:${r.surface} (${r.reason})`);
      }
      if (v === "MISSPELLED") invalidFlagged += 1;
    }
  }
  const valid = byKind.VALID ?? { n: 0, ok: 0, verdicts: {} };
  return {
    dataset: doc.dataset,
    datasetClass: doc.datasetClass,
    reviewStatus: "PENDING_NATIVE_REVIEW (no human review has taken place)",
    records: records.length,
    lemmaRecords: doc.lemmas.length,
    byKind,
    failures,
    byTag,
    valid: valid.n,
    accepted: valid.ok,
    acceptance: valid.n ? valid.ok / valid.n : 0,
    falseMisspelled,
    invalid: byKind.INVALID?.n ?? 0,
    invalidAsValid: invalidAsValidList,
    invalidAsValidCount: invalidAsValid,
    invalidFlagged,
    confidenceMedium,
    nativeReviewedRecords: loadNativeReviewed().records.length,
  };
}

/** Legacy engine measured on the same clean text + gold sets (for comparison). */
export function runLegacyComparison() {
  const lines = loadCleanLines();
  let words = 0;
  let fp = 0;
  for (const line of lines) {
    const r = buildOrthographySuggestions(line);
    words += r.wordCount;
    fp += r.suggestions.filter((s) => s.kind !== "LATIN_TO_CYRILLIC").length;
  }
  const rate = (cls: string, expectFlag: boolean) => {
    let ok = 0;
    let total = 0;
    for (const c of GOLD_CASES.filter((x) => x.cls === cls)) {
      total += 1;
      const r = buildOrthographySuggestions(c.input);
      const s = r.suggestions.find((x) => x.kind !== "LATIN_TO_CYRILLIC");
      if (expectFlag) {
        if (s && s.suggestedWord === c.expected) ok += 1;
      } else if (!s) ok += 1;
    }
    return { ok, total };
  };
  return {
    clean: { words, falsePositives: fp, fpPer1000Words: words ? (fp / words) * 1000 : 0 },
    goldMisspelling: rate("MISSPELLING", true),
    goldValid: rate("VALID", false),
    goldLegal: rate("LEGAL", false),
    goldUnknown: rate("UNKNOWN", false),
  };
}

export function bundledEngine(): SpellEngineV1 {
  return createSpellEngineV1();
}

/** The same vocabulary declared BROAD: shows what edit-distance detection does (and why SEED disables it). */
export function simulatedBroadEngine(): SpellEngineV1 {
  const packs = BUNDLED_PACKS.map((p) => ({ ...p, coverage: "BROAD" as const }));
  return createSpellEngineV1({ packs, typoPairs: BUNDLED_TYPO_PAIRS });
}
