/**
 * Evaluates «soft suggestions»: for a word the engine leaves UNKNOWN, would a unique edit-distance-1 lexicon neighbour be a
 * safe thing to show? Measured on the DEV slice only (never the frozen holdout) against the local second-opinion dictionary.
 *   npx tsx scripts/spell-data/soft-suggest-eval.ts [--limit 6000] [--minlen 6]
 * «FP» = the token is itself accepted by the second-opinion dictionary (a valid word we merely do not know), so a
 * suggestion on it would be a false accusation. Research data, never shipped.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

async function main() {
  const limit = Number(arg("--limit", "6000"));
  const minLen = Number(arg("--minlen", "6"));
  const hs = await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE));
  const eng = createSpellEngineV1();
  const types = new Map<string, { n: number; title: boolean }>();
  for await (const doc of eduge(limit, 0)) {
    for (const t of lex(doc.text)) {
      if (t.kind !== "WORD") continue;
      const k = normalizeToken(t.text);
      const r = types.get(k);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      if (r) (r.n += 1, (r.title = r.title && title));
      else types.set(k, { n: 1, title });
    }
  }
  let unkTok = 0, unkTypes = 0, sugTok = 0, sugTypes = 0, fpTok = 0, fpTypes = 0, tpTok = 0;
  const fps: string[] = [];
  const tps: string[] = [];
  for (const [k, r] of types) {
    if (r.title || k.length < minLen) continue;
    const a = eng.analyze(`и ${k}`).tokens[1]!;
    if (a.verdict !== "UNKNOWN") continue;
    unkTok += r.n; unkTypes += 1;
    const near = (eng as unknown as { nearest(k: string): { text: string; cost: number }[] }).nearest(k);
    const top = near[0];
    if (!top || top.cost > 1 || (near[1] && near[1].cost - top.cost < 0.5)) continue;
    sugTok += r.n; sugTypes += 1;
    if (hs.accepts(k)) { fpTok += r.n; fpTypes += 1; if (fps.length < 25) fps.push(`${k}→${top.text}×${r.n}`); }
    else { tpTok += r.n; if (tps.length < 25) tps.push(`${k}→${top.text}×${r.n}`); }
  }
  console.log(`UNKNOWN (len≥${minLen}, not capitalised): ${unkTypes} types / ${unkTok} tokens`);
  console.log(`with a unique edit-1 neighbour: ${sugTypes} types / ${sugTok} tokens`);
  console.log(`  token is a VALID word per second-opinion dictionary (FP): ${fpTypes} types / ${fpTok} tokens (${((100 * fpTok) / Math.max(1, sugTok)).toFixed(1)}%)`);
  console.log(`  token rejected by second-opinion dictionary (likely typo): ${tpTok} tokens`);
  console.log("FP sample:", fps.join(" "));
  console.log("TP sample:", tps.join(" "));
  hs.dispose();
}
void main();
