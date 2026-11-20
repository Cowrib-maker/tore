/**
 * Synthetic error benchmark on REAL running text (local corpus, class D).
 *   npx tsx scripts/spell-data/synthetic-eval.ts [--n 4000] [--seed 20261006] [--docs 3000]
 *
 * Protocol (seeded, reproducible):
 *  1. Reservoir-sample N real word TOKENS (frequency-weighted, like real writing)
 *     that the second-opinion dictionary accepts, are lower-case and ≥5 letters.
 *  2. Inject ONE realistic slip from the error model (kinds below).
 *  3. Keep the mutant only if the dictionary rejects it (a real-word error is
 *     undetectable by a word-level checker and is counted separately).
 *  4. Judge `и <mutant>` with (a) the shipping engine and (b) the research engine.
 * Reported: detection rate, top-1/top-3 repair, MRR, abstention (UNKNOWN) rate,
 * wrong-repair rate — overall and per error kind.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const VOWELS = "аэиоуөүяеёюый";
const SWAP: Record<string, string> = { о: "ө", ө: "о", у: "ү", ү: "у", а: "э", э: "а", и: "ы", ы: "и", я: "е", е: "я" };
const CONS: Record<string, string> = { д: "т", т: "д", г: "х", х: "г", б: "п", з: "с" };

type Kind = "DELETE" | "DOUBLE" | "TRANSPOSE" | "VOWEL_SWAP" | "VOWEL_DROP" | "CONSONANT_CLASS" | "SUFFIX_HARMONY";
const KINDS: Kind[] = ["DELETE", "DOUBLE", "TRANSPOSE", "VOWEL_SWAP", "VOWEL_DROP", "CONSONANT_CLASS", "SUFFIX_HARMONY"];

function mutate(w: string, kind: Kind, r: () => number): string | null {
  const n = w.length;
  const pick = (xs: number[]) => (xs.length ? xs[Math.floor(r() * xs.length)]! : -1);
  switch (kind) {
    case "DELETE": {
      const i = 1 + Math.floor(r() * (n - 1));
      return w.slice(0, i) + w.slice(i + 1);
    }
    case "DOUBLE": {
      const i = Math.floor(r() * n);
      return w.slice(0, i) + w[i] + w.slice(i);
    }
    case "TRANSPOSE": {
      const i = 1 + Math.floor(r() * (n - 2));
      return w[i] === w[i + 1] ? null : w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    }
    case "VOWEL_SWAP": {
      const i = pick([...w].map((c, k) => (SWAP[c] ? k : -1)).filter((k) => k >= 0));
      return i < 0 ? null : w.slice(0, i) + SWAP[w[i]!] + w.slice(i + 1);
    }
    case "VOWEL_DROP": {
      const i = pick([...w].map((c, k) => (k > 0 && VOWELS.includes(c) ? k : -1)).filter((k) => k >= 0));
      return i < 0 ? null : w.slice(0, i) + w.slice(i + 1);
    }
    case "CONSONANT_CLASS": {
      const i = pick([...w].map((c, k) => (CONS[c] ? k : -1)).filter((k) => k >= 0));
      return i < 0 ? null : w.slice(0, i) + CONS[w[i]!] + w.slice(i + 1);
    }
    case "SUFFIX_HARMONY": {
      for (const [a, b] of [["ийн", "ын"], ["ын", "ийн"], ["ийг", "ыг"], ["ыг", "ийг"], ["ээс", "аас"], ["аас", "ээс"], ["ээр", "аар"], ["аар", "ээр"], ["тай", "тэй"], ["тэй", "тай"]] as const) {
        if (w.endsWith(a)) return w.slice(0, -a.length) + b;
      }
      return null;
    }
  }
}

async function main() {
  const N = Number(arg("--n", "4000"));
  const docsLimit = Number(arg("--docs", "3000"));
  const seed = Number(arg("--seed", "20261006"));
  const r = rng(seed);
  const hs = await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE));
  // 1. reservoir-sample real tokens
  const pool: string[] = [];
  let seen = 0;
  for await (const doc of eduge(docsLimit)) {
    for (const t of lex(doc.text)) {
      if (t.kind !== "WORD" || t.caseShape !== "LOWER") continue;
      const k = normalizeToken(t.text);
      if (k.length < 5 || !/^[а-яёөү]+$/u.test(k) || !hs.accepts(k)) continue;
      seen += 1;
      if (pool.length < N) pool.push(k);
      else {
        const j = Math.floor(r() * seen);
        if (j < N) pool[j] = k;
      }
    }
  }
  console.log(`real tokens eligible ${seen}; sampled ${pool.length}`);

  const shipping = createSpellEngineV1();
  const dev = createSpellEngineV1({ research: hs, environment: "development", researchPolicy: JSON.parse(arg("--policy", "{}")) });
  type Acc = { n: number; realWord: number; ship: Stat; dev: Stat };
  type Stat = { flagged: number; unknown: number; valid: number; top1: number; top3: number; rr: number; wrongTop1: number; confident: number; confidentRight: number };
  const mk = (): Stat => ({ flagged: 0, unknown: 0, valid: 0, top1: 0, top3: 0, rr: 0, wrongTop1: 0, confident: 0, confidentRight: 0 });
  const per = new Map<Kind, Acc>();
  const total: Acc = { n: 0, realWord: 0, ship: mk(), dev: mk() };
  for (const k of KINDS) per.set(k, { n: 0, realWord: 0, ship: mk(), dev: mk() });

  const wrongLog: string[] = [];
  const judge = (eng: typeof dev, mutant: string, truth: string, s: Stat) => {
    const res = eng.analyze(`и ${mutant}`);
    const a = res.tokens[1]!;
    if (a.verdict === "VALID") {
      s.valid += 1;
      return;
    }
    if (a.verdict === "UNKNOWN") {
      s.unknown += 1;
      return;
    }
    s.flagged += 1;
    const issue = res.issues.find((i) => i.range.start === 2);
    const sug = (issue?.suggestions ?? []).map((x) => x.text);
    const idx = sug.indexOf(truth);
    const confident = issue?.suggestionStatus === "CONFIDENT" && sug.length > 0;
    if (confident) (s.confident += 1, idx === 0 && (s.confidentRight += 1));
    if (confident && idx !== 0 && s === total.ship) wrongLog.push(`${truth}\t${mutant}\t${sug.slice(0, 3).join("|")}\t${issue?.reasonCode}`);
    if (idx === 0) s.top1 += 1;
    else if (sug.length > 0) s.wrongTop1 += 1;
    if (idx >= 0 && idx < 3) s.top3 += 1;
    if (idx >= 0) s.rr += 1 / (idx + 1);
  };

  const t0 = Date.now();
  for (const w of pool) {
    const kind = KINDS[Math.floor(r() * KINDS.length)]!;
    const m = mutate(w, kind, r);
    if (!m || m === w || !/^[а-яёөү]+$/u.test(m)) continue;
    const acc = per.get(kind)!;
    for (const a of [acc, total]) a.n += 1;
    if (hs.accepts(m)) {
      for (const a of [acc, total]) a.realWord += 1; // a valid word: undetectable at word level
      continue;
    }
    for (const a of [acc, total]) {
      judge(shipping, m, w, a.ship);
      judge(dev, m, w, a.dev);
    }
  }
  console.log(`judged in ${Date.now() - t0} ms (seed ${seed})`);
  fs.mkdirSync(path.resolve(__dirname, "../../.spell-research/out"), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, "../../.spell-research/out/synthetic-wrong-top1.tsv"), wrongLog.join("\n"));
  const pct = (x: number, d: number) => (d ? `${((100 * x) / d).toFixed(1)}%` : "-");
  const row = (name: string, a: Acc) => {
    const det = a.n - a.realWord;
    const line = (tag: string, s: Stat) =>
      `  ${tag.padEnd(9)} detected ${pct(s.flagged, det).padStart(6)}  UNKNOWN ${pct(s.unknown, det).padStart(6)}  top-1 ${pct(s.top1, det).padStart(6)} (of flagged ${pct(s.top1, s.flagged)})  top-3 ${pct(s.top3, det).padStart(6)}  MRR ${(s.rr / Math.max(det, 1)).toFixed(3)}  wrong-top1 ${s.wrongTop1}  CONFIDENT-precision ${pct(s.confidentRight, s.confident)} (${s.confidentRight}/${s.confident})`;
    console.log(`${name.padEnd(16)} n=${a.n}  real-word collisions ${a.realWord} (${pct(a.realWord, a.n)})  testable ${det}`);
    console.log(line("shipping", a.ship));
    console.log(line("research", a.dev));
  };
  console.log("\n=== SYNTHETIC ERRORS ON REAL TEXT ===");
  row("ALL", total);
  for (const k of KINDS) row(k, per.get(k)!);
  hs.dispose();
  void path;
}
void main();
