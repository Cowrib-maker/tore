/**
 * Latency / memory in a CLEAN process (no corpus maps on the heap, so GC pauses do not pollute the numbers).
 *   NODE_OPTIONS=--expose-gc npx tsx scripts/spell-data/perf-v3.ts
 * COLD = 20,000-character windows of real news text never seen by this engine instance (its word caches fill as it goes: the realistic
 * «first check of a new document»), WARM = the same window re-checked. Word latency = one `analyze(word)` per distinct real word.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { createSpellEngineV1 as createPhase2 } from "../../tests/evaluation/spell-v3/frozen-phase2-2026-10-07/engine/bundled";
import { eduge } from "./lib/corpus";
const make = process.argv.includes("--phase2") ? createPhase2 : createSpellEngineV1;

const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
async function main() {
  let text = "";
  for await (const d of eduge(500)) {
    text += `${d.text}\n`;
    if (text.length > 1_400_000) break;
  }
  global.gc?.();
  const h0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const e = make();
  const coldStartMs = performance.now() - t0;
  global.gc?.();
  const heapMb = (process.memoryUsage().heapUsed - h0) / 1048576;
  const cold: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const w = text.slice(i * 20_000, (i + 1) * 20_000);
    const s = performance.now();
    e.analyze(w);
    cold.push(performance.now() - s);
  }
  const warm: number[] = [];
  for (let r = 0; r < 3; r += 1) for (let i = 0; i < 20; i += 1) {
    const w = text.slice(i * 20_000, (i + 1) * 20_000);
    const s = performance.now();
    e.analyze(w);
    warm.push(performance.now() - s);
  }
  const words = [...new Set(lex(text.slice(0, 400_000)).filter((t) => t.kind === "WORD").map((t) => t.text))].slice(0, 4000);
  const fresh = make();
  const ws: number[] = [];
  for (const w of words) {
    const s = performance.now();
    fresh.analyze(w);
    ws.push(performance.now() - s);
  }
  const f = (x: number) => Number(x.toFixed(2));
  const out = {
    cold20k: { p50Ms: f(q(cold.slice(5), 0.5)), p95Ms: f(q(cold.slice(5), 0.95)), maxMs: f(Math.max(...cold.slice(5))), firstWindowMs: f(cold[0]!) },
    warm20k: { p50Ms: f(q(warm, 0.5)), p95Ms: f(q(warm, 0.95)) },
    word: { p50Ms: f(q(ws, 0.5)), p95Ms: f(q(ws, 0.95)), p99Ms: f(q(ws, 0.99)), distinctWords: ws.length },
    engineHeapMb: f(heapMb), coldStartMs: f(coldStartMs), lexiconEntries: e.lexicon.size, engine: process.argv.includes("--phase2") ? "PHASE_2_FROZEN" : "PHASE_3_CURRENT",
  };
  console.log(JSON.stringify(out, null, 1));
}
void main();
