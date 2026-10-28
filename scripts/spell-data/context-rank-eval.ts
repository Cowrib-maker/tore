/**
 * Context RE-RANKING experiment: do unigram / bigram / trigram counts pick the right repair among several?
 *   npx tsx scripts/spell-data/context-rank-eval.ts [--train-docs 60000] [--cases 3000]
 *
 * 1. Held-out docs (id % 5 == 0): pick an interior word, apply a synthetic slip, run the DEV engine (second-opinion lexicon);
 *    keep the cases where the engine offers ≥2 repairs and the true word is one of them (the only cases re-ranking can change).
 * 2. One streaming pass over training docs (id % 5 != 0) counts ONLY the n-grams those cases need (memory stays small).
 * 3. Compare top-1 accuracy of: engine order · unigram · bigram · trigram, and the precision of the «decisive» subset.
 * Class-D corpus: LOCAL ONLY, nothing is written into the repo. The numbers measure re-ranking on SYNTHETIC slips in NEWS text.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { TrigramModel, ngramKeys, type Window } from "../../src/spell-engine/context/trigram";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";
import { FREQ_FILE } from "./frequency";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

type Case = { win: Window; truth: string; cands: string[]; mutant: string };

async function main() {
  if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
  const trainDocs = Number(arg("--train-docs", "60000"));
  const wantCases = Number(arg("--cases", "3000"));
  const hs = await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE));
  const dev = createSpellEngineV1({ research: hs, environment: "development" });
  let seed = 20261008;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const VOW = "аэоөуүи";
  const mutate = (w: string): string => {
    const i = 1 + Math.floor(rnd() * (w.length - 2));
    switch (Math.floor(rnd() * 4)) {
      case 0: return w.slice(0, i) + w.slice(i + 1);
      case 1: return w.slice(0, i) + w[i] + w.slice(i);
      case 2: return w.slice(0, i) + w[i + 1]! + w[i] + w.slice(i + 2);
      default: {
        const c = w[i]!;
        return VOW.includes(c) ? w.slice(0, i) + VOW[Math.floor(rnd() * VOW.length)]! + w.slice(i + 1) : w.slice(0, i) + w.slice(i + 1);
      }
    }
  };

  // 1. cases
  const cases: Case[] = [];
  const testWords: string[][] = [];
  for await (const doc of eduge(Infinity)) {
    if (doc.id % 5 !== 0) continue;
    const words = lex(doc.text).filter((t) => t.kind === "WORD").map((t) => normalizeToken(t.text));
    testWords.push(words);
    if (cases.length >= wantCases * 1.0 || testWords.length > 20000) break;
    for (let tries = 0; tries < 3 && words.length >= 12; tries += 1) {
      const p = 3 + Math.floor(rnd() * (words.length - 6));
      const w = words[p]!;
      if (w.length < 5 || !/^[а-яөү]+$/u.test(w) || !dev.analyze(`и ${w}`).tokens[1]!.verdict.startsWith("VALID")) continue;
      const m = mutate(w);
      if (m === w || hs.accepts(m)) continue;
      const res = dev.analyze(`и ${m}`);
      if (res.tokens[1]!.verdict !== "MISSPELLED") continue;
      const sug = (res.issues.find((i) => i.range.start === 2)?.suggestions ?? []).map((s) => s.text);
      if (sug.length < 2 || !sug.includes(w)) continue;
      cases.push({ win: { l2: words[p - 2] ?? null, l1: words[p - 1] ?? null, r1: words[p + 1] ?? null, r2: words[p + 2] ?? null }, truth: w, cands: sug, mutant: m });
      break;
    }
  }
  console.log(`cases: ${cases.length} (≥2 repairs offered, truth among them) from ${testWords.length} held-out docs`);

  // 2. needed keys → counts
  const need = new Set<string>();
  for (const c of cases) for (const cand of c.cands) for (const k of ngramKeys(c.win, cand)) need.add(k);
  const counts = new Map<string, number>();
  let total = 0;
  let docs = 0;
  for await (const doc of eduge(Infinity)) {
    if (doc.id % 5 === 0) continue;
    if (++docs > trainDocs) break;
    const w = lex(doc.text).filter((t) => t.kind === "WORD").map((t) => normalizeToken(t.text));
    total += w.length;
    for (let i = 0; i < w.length; i += 1) {
      const a = w[i]!;
      if (need.has(a)) counts.set(a, (counts.get(a) ?? 0) + 1);
      if (i >= 1) {
        const b = `${w[i - 1]} ${a}`;
        if (need.has(b)) counts.set(b, (counts.get(b) ?? 0) + 1);
      }
      if (i >= 2) {
        const t = `${w[i - 2]} ${w[i - 1]} ${a}`;
        if (need.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
  }
  console.log(`trained on ${docs} docs, ${total} tokens; ${counts.size} of ${need.size} needed n-grams seen`);

  // 3. compare
  const model = new TrigramModel((k) => counts.get(k) ?? 0, total, 200000);
  const uniOnly = (c: Case) => [...c.cands].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || c.cands.indexOf(a) - c.cands.indexOf(b));
  const orderBy = (c: Case, win: Window) => model.rerank(win, c.cands, { minDelta: 0, minSupport: 0 }).ordered.map((x) => x.text);
  const eq = { engine: 0, unigram: 0, bigram: 0, trigram: 0 };
  let decisive = 0;
  let decisiveRight = 0;
  let withSupport = 0;
  for (const c of cases) {
    if (c.cands[0] === c.truth) eq.engine += 1;
    if (uniOnly(c)[0] === c.truth) eq.unigram += 1;
    if (orderBy(c, { l2: null, l1: c.win.l1, r1: c.win.r1, r2: null })[0] === c.truth) eq.bigram += 1;
    if (orderBy(c, c.win)[0] === c.truth) eq.trigram += 1;
    const r = model.rerank(c.win, c.cands);
    if (r.ordered[0]!.support > 0) withSupport += 1;
    if (r.decisive) (decisive += 1, r.ordered[0]!.text === c.truth && (decisiveRight += 1));
  }
  const pct = (x: number, d = cases.length) => `${((100 * x) / Math.max(d, 1)).toFixed(1)}%`;
  console.log(`\ntop-1 accuracy among ${cases.length} multi-repair cases:`);
  console.log(`  engine order (edit cost)  ${pct(eq.engine)}`);
  console.log(`  + unigram frequency       ${pct(eq.unigram)}`);
  console.log(`  + bigram context          ${pct(eq.bigram)}`);
  console.log(`  + trigram context         ${pct(eq.trigram)}`);
  console.log(`  context had real support  ${pct(withSupport)}`);
  console.log(`  DECISIVE (Δ≥2 nats, support≥3): ${decisive} cases (${pct(decisive)}), precision ${pct(decisiveRight, decisive)}`);
  hs.dispose();
}
void main();
