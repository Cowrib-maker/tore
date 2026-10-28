/**
 * Phase 3 benchmark: slices × engines × tiers, aggregates only.
 *   npx tsx scripts/spell-data/benchmark-v3.ts --slice dev|holdout [--engines phase2,current,claim] [--save-baseline NAME] [--show]
 *
 * SLICES (local news corpus, class D; the ONLY representative corpus available — government/legal/email/academic text cannot be lawfully fetched):
 *   dev      documents 1…40,000, every 4th document. Used to guide work; words may be inspected.
 *   holdout  documents > 70,000 (PHASE_3_FROZEN_HOLDOUT). NEVER inspected word by word: this script prints AGGREGATES ONLY for it
 *            (counts/percentages, UNKNOWN-category shares), and `--show` is refused on it.
 * ENGINES:
 *   phase2   the frozen Phase-2 engine + data (tests/evaluation/spell-v3/frozen-phase2-2026-10-07)
 *   current  the working tree, every tier (the product configuration)
 *   claim    the working tree restricted to TRUSTED + REVIEWED packs — the only configuration allowed to back a RELEASE-QUALITY claim
 * A flagged word that the independent dictionary (class C, local) accepts is a FALSE-POSITIVE CANDIDATE (an upper bound would be the flag rate:
 * real typos are in the corpus). --save-baseline writes an aggregates-only JSON under tests/evaluation/spell-v3/baselines/ and REFUSES to
 * overwrite an existing baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { createSpellEngineV1 as createPhase2 } from "../../tests/evaluation/spell-v3/frozen-phase2-2026-10-07/engine/bundled";
import { eduge, hasEduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";
import { buildClassifier, type Category, type TypeRec } from "./lib/taxonomy-lib";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const has = (n: string) => process.argv.includes(n);

export const DEV_MAX_DOC = 40_000;
export const HOLDOUT_FROM_DOC = 70_000;
const GENRE: Record<string, string> = {
  хууль: "LEGAL(news)",
  "улс төр": "GOVERNMENT(news)",
  "эдийн засаг": "BUSINESS(news)",
  боловсрол: "EDUCATION(news)",
  технологи: "TECH(news)",
  "эрүүл мэнд": "HEALTH(news)",
  спорт: "SPORT(news)",
  "урлаг соёл": "CULTURE(news)",
  "байгал орчин": "ENVIRONMENT(news)",
};
type Verdict = "VALID" | "UNKNOWN" | "MISSPELLED";
type Judge = (rec: TypeRec) => Verdict;
type Engine = { analyze(t: string): { tokens: readonly { verdict: Verdict; reasonCode?: string }[] } };
/** VALID that rests on STRUCTURE, not on a lexicon entry (acronyms, initials, Latin): reported separately so coverage is not inflated. */
const STRUCTURAL = /^PROTECTED_(?!PROPER_NOUN)/;
const structuralHits = new WeakMap<TypeRec, boolean>();

const judgeWith = (e: Engine): Judge => (rec) => {
  const t = e.analyze(`и ${rec.titleOnly ? rec.sample : rec.key}`).tokens[1]!;
  structuralHits.set(rec, t.verdict === "VALID" && STRUCTURAL.test(t.reasonCode ?? ""));
  return t.verdict;
};

async function main() {
  if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
  const slice = arg("--slice", "dev");
  if (slice !== "dev" && slice !== "holdout") throw new Error("--slice dev|holdout");
  if (slice === "holdout" && has("--show")) throw new Error("--show is refused on the frozen holdout (aggregates only)");
  const wanted = arg("--engines", "phase2,current,claim").split(",");

  // ── ingest: per genre, types with counts
  type GenreAcc = { words: number; types: Map<string, TypeRec> };
  const genres = new Map<string, GenreAcc>();
  const all = new Map<string, TypeRec>();
  // CLEAN = documents without the corpus's letter-spacing artifact («т ө р ө л», «х ү м үү с»: ө/ү split off as lone tokens). That is a
  // defect of the corpus text, not of the engine; ALL is always reported too.
  const cleanGenres = new Map<string, GenreAcc>();
  const cleanAll = new Map<string, TypeRec>();
  let artifactDocs = 0;
  const otherKinds = new Map<string, number>();
  const ARTIFACT = /(?:^|[\s"«(])[өүӨҮ](?=$|[\s",.;:!?»)])/u;
  let docs = 0;
  let perfText = "";
  const skip = slice === "holdout" ? HOLDOUT_FROM_DOC : 0;
  const limit = slice === "holdout" ? Infinity : DEV_MAX_DOC;
  for await (const d of eduge(limit, skip)) {
    if (slice === "dev" && d.id % 4 !== 1) continue;
    docs += 1;
    if (perfText.length < 120_000) perfText += `${d.text}\n`;
    const g = GENRE[d.label] ?? "OTHER";
    const artifact = ARTIFACT.test(d.text);
    if (artifact) artifactDocs += 1;
    const acc = genres.get(g) ?? { words: 0, types: new Map() };
    genres.set(g, acc);
    const cacc = cleanGenres.get(g) ?? { words: 0, types: new Map() };
    cleanGenres.set(g, cacc);
    for (const t of lex(d.text)) {
      if (t.kind === "SPACE" || t.kind === "PUNCT") continue;
      if (t.kind !== "WORD") {
        otherKinds.set(t.kind, (otherKinds.get(t.kind) ?? 0) + 1);
        continue;
      }
      acc.words += 1;
      if (!artifact) cacc.words += 1;
      const key = normalizeToken(t.text);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      const upper = t.caseShape === "UPPER" && t.text.length > 1;
      for (const m of artifact ? [acc.types, all] : [acc.types, all, cacc.types, cleanAll]) {
        const r = m.get(key);
        if (r) (r.n += 1, (r.titleOnly = r.titleOnly && title), (r.upperOnly = r.upperOnly && upper));
        else m.set(key, { key, n: 1, titleOnly: title, upperOnly: upper, sample: t.text });
      }
    }
  }
  const totalWords = [...genres.values()].reduce((s, g) => s + g.words, 0);
  const cleanWords = [...cleanGenres.values()].reduce((a, g) => a + g.words, 0);
  const otherTotal = [...otherKinds.values()].reduce((a, b) => a + b, 0);
  console.log(`NOT counted as words (protected / non-word kinds): ${[...otherKinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / (totalWords + otherTotal)).toFixed(2)}%`).join(" · ")} of all non-space tokens`);
  console.log(`slice ${slice.toUpperCase()}: ${docs} documents (${artifactDocs} with the spaced-ө/ү corpus artifact = ${((100 * artifactDocs) / docs).toFixed(1)}%), ${totalWords} word tokens, ${all.size} types; CLEAN subset ${cleanWords} tokens`);

  const hs = await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE));
  const engines: { name: string; judge: Judge; coldMs: number }[] = [];
  global.gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  let engineHeapDeltaMb = 0;
  const mk = (name: string, f: () => Engine) => {
    const t0 = performance.now();
    const e = f();
    engines.push({ name, judge: judgeWith(e), coldMs: performance.now() - t0 });
    return e;
  };
  if (wanted.includes("phase2")) mk("PHASE_2_FROZEN", () => createPhase2() as unknown as Engine);
  const current = wanted.includes("current") ? mk("PHASE_3_CURRENT", () => createSpellEngineV1() as unknown as Engine) : undefined;
  global.gc?.();
  engineHeapDeltaMb = (process.memoryUsage().heapUsed - heap0) / 1048576;
  if (wanted.includes("claim")) mk("RELEASE_CLAIM(TRUSTED+REVIEWED)", () => createSpellEngineV1({ minTier: "TRUSTED" }) as unknown as Engine);

  type Cell = { words: number; valid: number; validStructural: number; unknown: number; misspelled: number; fpCandidates: number };
  const result: Record<string, Record<string, Cell>> = {};
  const flaggedDev: Map<string, { n: number; oracle: boolean }>[] = [];
  for (const e of engines) {
    result[e.name] = {};
    const total: Cell = { words: 0, valid: 0, validStructural: 0, unknown: 0, misspelled: 0, fpCandidates: 0 };
    const flagged = new Map<string, { n: number; oracle: boolean }>();
    for (const [g, acc] of genres) {
      const c: Cell = { words: acc.words, valid: 0, validStructural: 0, unknown: 0, misspelled: 0, fpCandidates: 0 };
      for (const rec of acc.types.values()) {
        const v = e.judge(rec);
        if (v === "VALID") (c.valid += rec.n, structuralHits.get(rec) && (c.validStructural += rec.n));
        else if (v === "UNKNOWN") c.unknown += rec.n;
        else {
          c.misspelled += rec.n;
          const ok = hs.accepts(rec.key);
          if (ok) c.fpCandidates += rec.n;
          if (slice === "dev") flagged.set(rec.key, { n: rec.n, oracle: ok });
        }
      }
      result[e.name]![g] = c;
      for (const k of Object.keys(total) as (keyof Cell)[]) total[k] += c[k];
    }
    result[e.name]!["ALL"] = total;
    const ctotal: Cell = { words: cleanWords, valid: 0, validStructural: 0, unknown: 0, misspelled: 0, fpCandidates: 0 };
    for (const rec of cleanAll.values()) {
      const v = e.judge(rec);
      if (v === "VALID") (ctotal.valid += rec.n, structuralHits.get(rec) && (ctotal.validStructural += rec.n));
      else if (v === "UNKNOWN") ctotal.unknown += rec.n;
      else (ctotal.misspelled += rec.n, hs.accepts(rec.key) && (ctotal.fpCandidates += rec.n));
    }
    result[e.name]!["CLEAN(no artifact docs)"] = ctotal;
    flaggedDev.push(flagged);
  }

  const pct = (x: number, d: number) => `${((100 * x) / Math.max(d, 1)).toFixed(2)}%`;
  console.log(`\n${"engine".padEnd(34)}${"genre".padEnd(20)}${"words".padStart(9)}${"LEXICAL%".padStart(9)}${"UNKNOWN".padStart(9)}${"flag/1k".padStart(9)}${"FPcand".padStart(8)}`);
  for (const e of engines) for (const [g, c] of Object.entries(result[e.name]!)) {
    if (g !== "ALL" && !g.startsWith("CLEAN") && e.name !== "PHASE_3_CURRENT") continue;
    console.log(`${e.name.padEnd(34)}${g.padEnd(20)}${String(c.words).padStart(9)}${pct(c.valid - c.validStructural, c.words).padStart(9)}${pct(c.unknown, c.words).padStart(9)}${((1000 * c.misspelled) / Math.max(c.words, 1)).toFixed(2).padStart(9)}${String(c.fpCandidates).padStart(8)}`);
  }

  // ── UNKNOWN taxonomy for the current engine (aggregates only)
  const taxonomy: Record<string, { tokens: number; types: number }> = {};
  let unknownTokens = 0;
  if (current) {
    const classify = buildClassifier(current as never, hs, loadFrequencyTable(FREQ_FILE));
    for (const rec of cleanAll.values()) {
      if (judgeWith(current)(rec) !== "UNKNOWN") continue;
      unknownTokens += rec.n;
      const c = classify(rec).cat as Category;
      const x = (taxonomy[c] ??= { tokens: 0, types: 0 });
      x.tokens += rec.n;
      x.types += 1;
    }
    console.log(`\nUNKNOWN taxonomy (PHASE_3_CURRENT, CLEAN subset: ${unknownTokens} tokens = ${pct(unknownTokens, cleanWords)} of it):`);
    for (const [c, x] of Object.entries(taxonomy).sort((a, b) => b[1].tokens - a[1].tokens)) console.log(`  ${c.padEnd(20)} ${String(x.tokens).padStart(8)} tokens  ${pct(x.tokens, unknownTokens).padStart(7)} of UNKNOWN  ${pct(x.tokens, cleanWords).padStart(7)} of clean  ${String(x.types).padStart(6)} types`);
  }

  // ── dev only: flagged words that the oracle accepts (inspectable)
  if (slice === "dev" && has("--show") && flaggedDev.length) {
    const idx = engines.findIndex((e) => e.name === "PHASE_3_CURRENT");
    const f = flaggedDev[Math.max(idx, 0)]!;
    console.log("\nFP candidates (flagged, oracle accepts):", [...f].filter(([, v]) => v.oracle).map(([k, v]) => `${k}×${v.n}`).join(" ") || "none");
    console.log("flagged, oracle also rejects (likely real typos), top 40:", [...f].filter(([, v]) => !v.oracle).sort((a, b) => b[1].n - a[1].n).slice(0, 40).map(([k, v]) => `${k}×${v.n}`).join(" "));
  }

  // ── perf (current)
  let perf: Record<string, number> | undefined;
  if (current) {
    const doc = perfText.slice(0, 20_000);
    // distinct 20k windows: the median over 6 real windows
    const windows = [0, 1, 2, 3, 4, 5].map((i) => perfText.slice(i * 20_000, (i + 1) * 20_000)).filter((w) => w.length >= 19_000);
    const words = lex(doc).filter((t) => t.kind === "WORD").map((t) => t.text).slice(0, 2000);
    const samples: number[] = [];
    for (const w of words) {
      const s = performance.now();
      (current as unknown as { analyze(t: string): unknown }).analyze(`и ${w}`);
      samples.push(performance.now() - s);
    }
    samples.sort((a, b) => a - b);
    const q = (p: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))] ?? 0;
    const d: number[] = [];
    (current as unknown as { analyze(t: string): unknown }).analyze(windows[0] ?? doc); // warm-up
    for (const w of windows) {
      const s = performance.now();
      (current as unknown as { analyze(t: string): unknown }).analyze(w);
      d.push(performance.now() - s);
    }
    d.sort((a, b) => a - b);
    global.gc?.();
    perf = { wordP50Ms: q(0.5), wordP95Ms: q(0.95), wordP99Ms: q(0.99), doc20kMedianMs: d[Math.floor(d.length / 2)] ?? 0, doc20kMaxMs: d[d.length - 1] ?? 0, engineHeapDeltaMb, coldStartMs: engines.find((e) => e.name === "PHASE_3_CURRENT")!.coldMs };
    console.log("\nperf:", JSON.stringify(Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, Number(v.toFixed(3))]))));
  }

  const out = { schema: "tore-spell-benchmark/3", date: new Date().toISOString(), slice, nonWordKinds: Object.fromEntries(otherKinds), documents: docs, artifactDocs, words: totalWords, cleanWords, types: all.size, engines: Object.keys(result), result, unknownTaxonomy: taxonomy, unknownTokens, perf, note: "aggregates only; no corpus text" };
  const dir = path.resolve(__dirname, "../../.spell-research/out");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `benchmark-v3-${slice}.json`), JSON.stringify(out, null, 2));
  const save = arg("--save-baseline", "");
  if (save) {
    const f = path.resolve(__dirname, `../../tests/evaluation/spell-v3/baselines/${save}.json`);
    if (fs.existsSync(f)) throw new Error(`baseline ${save} already exists: baselines are never overwritten (use a new name)`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(out, null, 2));
    console.log(`saved immutable baseline ${path.relative(process.cwd(), f)}`);
  }
  hs.dispose();
}
void main();
