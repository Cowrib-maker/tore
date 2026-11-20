/**
 * Real-word (context) experiment on a LOCAL corpus.
 *   npx tsx scripts/spell-data/context-eval.ts [--train-docs 40000] [--test-docs 600] [--minDelta 6] [--minSupport 5]
 *
 * 1. Train a focus-vocabulary bigram model on docs with id % 5 != 0 (only n-grams that touch a confusable word are
 *    kept, so memory stays small). The model is derived from class-D data: LOCAL ONLY, never written into the repo.
 * 2. Held-out docs (id % 5 == 0):
 *    A. FALSE ALARMS — run the module over UNMODIFIED text; every report there is an alarm on correct writing
 *       (some are real typos in the corpus, so the count is an upper bound).
 *    B. SWAP RECALL  — replace a token by its confusable partner (a real-word error), run the module, count how often it
 *       points at that token with the original word as the suggestion.
 */
import path from "node:path";
import fs from "node:fs";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { NGramContextModel } from "../../src/spell-engine/context/ngram";
import { RealWordContextModule, buildConfusionSets } from "../../src/spell-engine/context/real-word";
import type { NGramData } from "../../src/spell-engine/context/types";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

async function main() {
  if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
  const trainDocs = Number(arg("--train-docs", "40000"));
  const testDocs = Number(arg("--test-docs", "600"));
  const engine = createSpellEngineV1();
  const sets = buildConfusionSets(engine);
  const focus = new Set<string>();
  for (const [k, v] of sets) (focus.add(k), v.forEach((x) => focus.add(x)));
  console.log(`confusion pairs from the lexicon: ${[...sets.values()].reduce((s, l) => s + l.length, 0) / 2}; focus words ${focus.size}`);

  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  let total = 0;
  const test: string[] = [];
  let seen = 0;
  for await (const doc of eduge(Infinity)) {
    seen += 1;
    if (doc.id % 5 === 0) {
      if (test.length < testDocs) test.push(doc.text);
      continue;
    }
    if (seen > trainDocs + testDocs * 6) break;
    const words = lex(doc.text).filter((t) => t.kind === "WORD").map((t) => normalizeToken(t.text));
    for (let i = 0; i < words.length; i += 1) {
      const w = words[i]!;
      total += 1;
      uni.set(w, (uni.get(w) ?? 0) + 1);
      if (i > 0 && (focus.has(w) || focus.has(words[i - 1]!))) bi.set(`${words[i - 1]} ${w}`, (bi.get(`${words[i - 1]} ${w}`) ?? 0) + 1);
    }
  }
  const data: NGramData = {
    schema: "tore-spell-ngram/1",
    id: "ngram-eduge-focus",
    version: "local",
    provenance: { source: "local research corpus (class D)", license: "unstated", redistributable: false, dataClass: "D_BENCHMARK_ONLY" },
    total,
    // keep unigram counts only for words that appear in a kept bigram or are focus words
    unigrams: Object.fromEntries([...uni].filter(([w, c]) => focus.has(w) || c >= 3)),
    bigrams: Object.fromEntries([...bi].filter(([, c]) => c >= 2)),
  };
  console.log(`trained on ${total} tokens; ${Object.keys(data.unigrams).length} unigrams, ${Object.keys(data.bigrams).length} bigrams; held-out docs ${test.length}`);
  const minDelta = Number(arg("--minDelta", "6"));
  const minSupport = Number(arg("--minSupport", "5"));
  const mod = new RealWordContextModule(engine, new NGramContextModel(data), { minDelta, minSupport });

  // A. false alarms on unmodified text
  let words = 0;
  const alarms: string[] = [];
  for (const text of test) {
    words += lex(text).filter((t) => t.kind === "WORD").length;
    const tokens = lex(text);
    for (const d of mod.analyze({ text, tokens, engine, options: {} })) alarms.push(`${d.original}→${d.suggestions[0]!.text}`);
  }
  console.log(`\nA. FALSE-ALARM CHECK on unmodified held-out text: ${alarms.length} reports in ${words} words (${((alarms.length / words) * 1000).toFixed(2)} per 1000 words)`);
  const freq = new Map<string, number>();
  for (const a of alarms) freq.set(a, (freq.get(a) ?? 0) + 1);
  console.log(`   most frequent: ${[...freq].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}×${v}`).join("  ")}`);

  // B. swap recall
  let swapped = 0;
  let found = 0;
  let foundRight = 0;
  let spurious = 0;
  let seed = 20261007;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const text of test) {
    const tokens = lex(text);
    const idx = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.kind === "WORD" && x.t.caseShape === "LOWER" && sets.has(normalizeToken(x.t.text)));
    if (idx.length === 0) continue;
    const pick = idx[Math.floor(rnd() * idx.length)]!;
    const partner = sets.get(normalizeToken(pick.t.text))![0]!;
    const mutated = text.slice(0, pick.t.range.start) + partner + text.slice(pick.t.range.end);
    swapped += 1;
    const toks2 = lex(mutated);
    const ds = mod.analyze({ text: mutated, tokens: toks2, engine, options: {} });
    const at = ds.find((d) => d.range.start === pick.t.range.start);
    if (at) {
      found += 1;
      if (at.suggestions[0]!.text.toLowerCase() === normalizeToken(pick.t.text)) foundRight += 1;
    }
    spurious += ds.filter((d) => d !== at).length;
  }
  console.log(`\nB. REAL-WORD SWAPS: ${swapped} docs each with one confusable word replaced by its partner`);
  console.log(`   flagged at the swapped word: ${found} (${((100 * found) / swapped).toFixed(1)}%); suggestion = the original word: ${foundRight} (${((100 * foundRight) / Math.max(found, 1)).toFixed(1)}% of flagged)`);
  console.log(`   other reports in those documents (alarms): ${spurious}`);
  fs.mkdirSync(path.resolve(__dirname, "../../.spell-research/out"), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, "../../.spell-research/out/context-alarms.txt"), alarms.join("\n"));
}
void main();
