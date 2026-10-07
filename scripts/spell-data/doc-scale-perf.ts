/**
 * Document-scale latency of the desktop checking path (paragraph-cached DesktopSpellSession) on REAL local news text.
 *   npx tsx scripts/spell-data/doc-scale-perf.ts
 * Reports, per size (1 paragraph / 1 / 10 / 50 pages ≈ 3,000 chars each): first full check, a re-check after editing ONE
 * paragraph (what typing costs), and heap growth. Local research text is only read, never stored or committed.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { DesktopSpellSession, type DictionaryDoc } from "../../desktop/core/spell-session";
import { MemoryStore } from "../../desktop/core/store";
import { eduge } from "./lib/corpus";

const PAGE = 3000;
const ms = (t0: bigint) => Number(process.hrtime.bigint() - t0) / 1e6;

async function main() {
  const paras: string[] = [];
  for await (const d of eduge(400, 70_000)) for (const p of d.text.split(/\n+/)) if (p.length > 80) paras.push(p.slice(0, 700));
  const build = (chars: number, from: number) => {
    const out: string[] = [];
    let n = 0;
    for (let i = from; n < chars; i += 1) { const p = paras[i % paras.length]!; out.push(p); n += p.length + 1; }
    return out.join("\n");
  };
  const t0 = process.hrtime.bigint();
  const session = new DesktopSpellSession(createSpellEngineV1(), new MemoryStore<DictionaryDoc>(), { isEntitled: async () => true });
  await session.check("Жишээ текст.");
  console.log(`cold start (engine + first check): ${ms(t0).toFixed(0)} ms`);
  const heap0 = process.memoryUsage().heapUsed;
  const rows: string[] = [];
  for (const [label, chars, from] of [["1 paragraph", 600, 0], ["1 page", PAGE, 50], ["10 pages", 10 * PAGE, 200], ["50 pages", 50 * PAGE, 600]] as const) {
    const text = build(chars, from);
    const s = new DesktopSpellSession(createSpellEngineV1(), new MemoryStore<DictionaryDoc>(), { isEntitled: async () => true });
    const a = process.hrtime.bigint();
    await s.check(text);
    const first = ms(a);
    const lines = text.split("\n");
    const mid = Math.floor(lines.length / 2);
    const edits: number[] = [];
    for (let k = 0; k < 20; k += 1) {
      lines[mid] = lines[mid]! + (k % 2 ? "а" : "б"); // one paragraph changes per keystroke
      const e = process.hrtime.bigint();
      await s.check(lines.join("\n"));
      edits.push(ms(e));
    }
    edits.sort((x, y) => x - y);
    const same = process.hrtime.bigint();
    await s.check(lines.join("\n"));
    rows.push(`${label.padEnd(12)} ${String(text.length).padStart(7)} chars  first ${first.toFixed(0).padStart(5)} ms   edit-one-paragraph p50 ${edits[10]!.toFixed(1).padStart(6)} ms  max ${edits[19]!.toFixed(1).padStart(6)} ms   unchanged re-check ${ms(same).toFixed(1)} ms`);
  }
  console.log(rows.join("\n"));
  console.log(`heap growth over the run: ${((process.memoryUsage().heapUsed - heap0) / 1048576).toFixed(1)} MB`);
}
void main();
