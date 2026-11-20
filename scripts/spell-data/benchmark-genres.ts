/**
 * Genre-level real-text benchmark, four engines side by side.
 *   npx tsx scripts/spell-data/benchmark-genres.ts [--tokens 500000] [--out .spell-research/out/benchmark-genres.json]
 *
 * Corpus: the local news corpus (class D, never committed). A deterministic, label-stratified sample of ≥N word
 * tokens; the corpus topic labels are the "genres" (law, politics, economy, education, technology, health, sport,
 * culture, environment). They are all NEWS: no clean government/legal/academic corpus is lawfully available, and the
 * report says so. The corpus contains real typos, so the numbers below are UPPER BOUNDS on false accusations.
 *
 * Engines: LEGACY (orthography v0) · FROZEN_SHIPPING (the engine as it stood at the start of this phase) ·
 *          NEW_SHIPPING (current class-A engine) · RESEARCH (new + local second-opinion lexicon + frequency).
 * Per engine and genre: VALID / UNKNOWN / MISSPELLED token shares, MISSPELLED per 1000 words, and FALSE-POSITIVE CANDIDATES
 * (flagged words the independent dictionary accepts). Latency/memory/cold start are measured per engine.
 */
import fs from "node:fs";
import path from "node:path";
import { buildOrthographySuggestions } from "../../src/domain/mongolian-orthography";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { createSpellEngineV1 as createFrozen } from "../../tests/evaluation/spell-v1/frozen-shipping-2026-10-06/engine/bundled";
import { eduge, hasEduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";

import { HELD_OUT_FROM } from "./lib/corpus";
const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

type Verdict = "VALID" | "UNKNOWN" | "MISSPELLED";
type Judge = (key: string, titleSample: string | null) => Verdict;

const GENRE: Record<string, string> = {
  хууль: "LEGAL",
  "улс төр": "GOVERNMENT/POLITICS",
  "эдийн засаг": "BUSINESS/ECONOMY",
  боловсрол: "ACADEMIC/EDUCATION",
  технологи: "TECH",
  "эрүүл мэнд": "HEALTH",
  спорт: "SPORT",
  "урлаг соёл": "CULTURE",
  "байгал орчин": "ENVIRONMENT",
};

async function main() {
  if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
  const target = Number(arg("--tokens", "500000"));
  const perLabel = new Map<string, { docs: string[]; tokens: number }>();
  // Held-out by default: documents 1…HELD_OUT_FROM were used to prioritise vocabulary work (--in-sample includes them).
  const heldOutFrom = process.argv.includes("--in-sample") ? 0 : HELD_OUT_FROM;
  console.log(heldOutFrom ? `HELD-OUT sample (documents after ${heldOutFrom})` : "IN-SAMPLE (includes documents used for prioritising work)");
  for await (const d of eduge(Infinity, heldOutFrom)) {
    const g = GENRE[d.label] ?? "OTHER";
    const b = perLabel.get(g) ?? { docs: [], tokens: 0 };
    perLabel.set(g, b);
    if (d.id % 7 !== 3) continue; // deterministic spread across the file
    const n = d.text.split(/\s+/).length;
    if (b.tokens < target / 9 + 1) (b.docs.push(d.text), (b.tokens += n));
    if ([...perLabel.values()].every((x) => x.tokens >= target / 9) && perLabel.size >= 9) break;
  }

  // types per genre
  type TypeRec = { key: string; n: number; titleOnly: boolean; sample: string };
  const genres = new Map<string, { types: Map<string, TypeRec>; tokens: number; words: number }>();
  for (const [g, b] of perLabel) {
    const types = new Map<string, TypeRec>();
    let words = 0;
    let tokens = 0;
    for (const text of b.docs) {
      for (const t of lex(text)) {
        if (t.kind === "SPACE" || t.kind === "PUNCT") continue;
        tokens += 1;
        if (t.kind !== "WORD") continue;
        words += 1;
        const key = normalizeToken(t.text);
        const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
        const r = types.get(key);
        if (r) (r.n += 1, (r.titleOnly = r.titleOnly && title));
        else types.set(key, { key, n: 1, titleOnly: title, sample: t.text });
      }
    }
    genres.set(g, { types, tokens, words });
  }
  const totalWords = [...genres.values()].reduce((s, g) => s + g.words, 0);
  console.log(`corpus sample: ${totalWords} word tokens in ${genres.size} genres (${[...genres].map(([g, v]) => `${g}:${v.words}`).join(" ")})`);

  const hs = await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE));
  const engines: { name: string; judge: Judge; coldMs: number; heapMb: number }[] = [];

  const mem = () => (global.gc?.(), process.memoryUsage().heapUsed / 1048576);
  let t0 = performance.now();
  let h0 = mem();
  // LEGACY (orthography v0) has no UNKNOWN: «VALID» below means «not flagged».
  const legacyJudge: Judge = (key, sample) => (buildOrthographySuggestions(sample ?? key, { includeLatinToCyrillic: false }).suggestions.length > 0 ? "MISSPELLED" : "VALID");
  engines.push({ name: "LEGACY", judge: legacyJudge, coldMs: performance.now() - t0, heapMb: mem() - h0 });

  t0 = performance.now();
  h0 = mem();
  const frozen = createFrozen();
  engines.push({
    name: "FROZEN_SHIPPING",
    judge: (key, sample) => v1Verdict(frozen, key, sample),
    coldMs: performance.now() - t0,
    heapMb: mem() - h0,
  });
  t0 = performance.now();
  h0 = mem();
  const current = createSpellEngineV1();
  engines.push({ name: "NEW_SHIPPING", judge: (key, sample) => v1Verdict(current, key, sample), coldMs: performance.now() - t0, heapMb: mem() - h0 });
  t0 = performance.now();
  h0 = mem();
  const research = createSpellEngineV1({ research: hs, environment: "development" });
  engines.push({ name: "RESEARCH", judge: (key, sample) => v1Verdict(research, key, sample), coldMs: performance.now() - t0, heapMb: mem() - h0 });

  type Cell = { words: number; valid: number; unknown: number; misspelled: number; fpCandidates: number };
  const result: Record<string, Record<string, Cell>> = {};
  for (const e of engines) {
    result[e.name] = {};
    const allCell: Cell = { words: 0, valid: 0, unknown: 0, misspelled: 0, fpCandidates: 0 };
    for (const [g, data] of genres) {
      const cell: Cell = { words: data.words, valid: 0, unknown: 0, misspelled: 0, fpCandidates: 0 };
      for (const t of data.types.values()) {
        const v = e.judge(t.key, t.titleOnly ? t.sample : null);
        if (v === "VALID") cell.valid += t.n;
        else if (v === "UNKNOWN") cell.unknown += t.n;
        else {
          cell.misspelled += t.n;
          if (hs.accepts(t.key)) cell.fpCandidates += t.n;
        }
      }
      result[e.name]![g] = cell;
      for (const k of Object.keys(allCell) as (keyof Cell)[]) allCell[k] += cell[k];
    }
    result[e.name]!["ALL"] = allCell;
  }

  const pct = (x: number, d: number) => `${((100 * x) / Math.max(d, 1)).toFixed(2)}%`;
  const per1k = (x: number, d: number) => ((1000 * x) / Math.max(d, 1)).toFixed(2);
  console.log(`\n${"engine".padEnd(16)}${"genre".padEnd(22)}${"words".padStart(8)}${"VALID".padStart(9)}${"UNKNOWN".padStart(9)}${"flag/1k".padStart(9)}${"FPcand/1k".padStart(11)}`);
  for (const e of engines) {
    for (const [g, c] of Object.entries(result[e.name]!)) {
      console.log(`${e.name.padEnd(16)}${g.padEnd(22)}${String(c.words).padStart(8)}${pct(c.valid, c.words).padStart(9)}${pct(c.unknown, c.words).padStart(9)}${per1k(c.misspelled, c.words).padStart(9)}${per1k(c.fpCandidates, c.words).padStart(11)}`);
    }
  }

  // performance on a 20k-character document
  const doc = [...genres.values()][0]!.types.size ? [...perLabel.values()][0]!.docs.join(" ").slice(0, 20_000) : "";
  const perf: Record<string, { cold: number; heapMb: number; doc20kMs: number; wordP95Ms: number }> = {};
  const words = lex(doc).filter((t) => t.kind === "WORD").map((t) => t.text).slice(0, 2000);
  for (const e of engines) {
    const samples: number[] = [];
    for (const w of words) {
      const s = performance.now();
      e.judge(normalizeToken(w), null);
      samples.push(performance.now() - s);
    }
    samples.sort((a, b) => a - b);
    const s0 = performance.now();
    if (e.name === "NEW_SHIPPING") current.analyze(doc);
    else if (e.name === "FROZEN_SHIPPING") frozen.analyze(doc);
    else if (e.name === "RESEARCH") research.analyze(doc);
    const doc20kMs = performance.now() - s0;
    perf[e.name] = { cold: e.coldMs, heapMb: e.heapMb, doc20kMs, wordP95Ms: samples[Math.floor(samples.length * 0.95)] ?? 0 };
  }
  console.log("\nperformance (20k-char document / per-word p95 / cold start / heap delta):");
  for (const [n, p] of Object.entries(perf)) console.log(`  ${n.padEnd(16)} doc20k ${p.doc20kMs.toFixed(1)} ms · word p95 ${p.wordP95Ms.toFixed(3)} ms · cold ${p.cold.toFixed(0)} ms · heap +${p.heapMb.toFixed(1)} MB`);

  const out = arg("--out", path.resolve(__dirname, "../../.spell-research/out/benchmark-genres.json"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), corpus: "local news corpus (class D), label-stratified sample", words: totalWords, result, perf }, null, 2));
  console.log(`\nwrote ${path.relative(process.cwd(), out)}`);
  hs.dispose();
}

type V1Like = { analyze(text: string): { tokens: readonly { verdict: Verdict }[] } };
function v1Verdict(engine: V1Like, key: string, titleSample: string | null): Verdict {
  const r = engine.analyze(`и ${titleSample ?? key}`);
  return r.tokens[1]!.verdict;
}

void main();
