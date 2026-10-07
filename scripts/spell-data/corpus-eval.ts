/**
 * Real-text evaluation on a local corpus (default: Eduge news, class D).
 *   npx tsx scripts/spell-data/corpus-eval.ts [--limit 5000] [--out dir]
 *
 * 1. Tokenise every article with the ENGINE's offset-preserving lexer, count
 *    word TYPES (case-folded) and TOKENS.
 * 2. Verdict per type from the shipping engine (class-A packs only).
 * 3. Cross-tab against the Hunspell second opinion (it is not ground truth —
 *    it also errs — so disagreements are written out for review, not counted
 *    as proven errors).
 * Nothing here leaves the machine; nothing is bundled.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { hasResearchDict, loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";

type TypeRec = { key: string; n: number; titleOnly: boolean; sample: string };

/** Judge a type the way the editor would: mid-sentence, with its real capitalisation. */
function judge(engine: ReturnType<typeof createSpellEngineV1>, rec: TypeRec) {
  const text = `и ${rec.titleOnly ? rec.sample : rec.key}`;
  const r = engine.analyze(text);
  const a = r.tokens[1]!;
  const issue = r.issues.find((i) => i.range.start === 2);
  return { verdict: a.verdict, reason: a.reasonCode, sugg: issue?.suggestions.map((x) => x.text).join("|") ?? "" };
}

async function main() {
  if (!hasEduge()) throw new Error("Eduge not present: run scripts/spell-data/fetch-research.ts");
  const limit = Number(argv("--limit") ?? 5000);
  const outDir = argv("--out") ?? path.resolve(__dirname, "../../.spell-research/out");
  fs.mkdirSync(outDir, { recursive: true });

  // ── Stage: ingest → normalise → tokenise → frequency
  const t0 = Date.now();
  const types = new Map<string, TypeRec>();
  let tokens = 0;
  let protectedTokens = 0;
  let docs = 0;
  const skip = Number(argv("--skip") ?? 0);
  if (skip > 0) console.log(`HELD-OUT run: skipping the first ${skip} documents (never used to prioritise vocabulary work)`);
  for await (const doc of eduge(limit, skip)) {
    docs += 1;
    for (const t of lex(doc.text)) {
      if (t.kind === "SPACE" || t.kind === "PUNCT") continue;
      tokens += 1;
      if (t.kind !== "WORD") {
        protectedTokens += 1;
        continue;
      }
      const key = normalizeToken(t.text);
      const r = types.get(key);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      if (r) {
        r.n += 1;
        r.titleOnly = r.titleOnly && title;
      } else types.set(key, { key, n: 1, titleOnly: title, sample: t.text });
    }
  }
  console.log(`docs ${docs}, tokens ${tokens} (non-word ${protectedTokens}), word types ${types.size}  [${Date.now() - t0} ms]`);

  const shipping = createSpellEngineV1();
  const hs = hasResearchDict() ? await loadHunspellResearchProvider(loadFrequencyTable(FREQ_FILE)) : undefined;
  if (!hs) console.log("(no research dictionary: skipping oracle cross-tab)");

  type Row = { key: string; n: number; verdict: string; reason: string; hs: boolean; sugg: string };
  const rows: Row[] = [];
  const t1 = Date.now();
  for (const r of types.values()) {
    // Evaluate each type in lower-case, mid-sentence: no capitalisation heuristics.
    const a = judge(shipping, r);
    rows.push({ key: r.key, n: r.n, verdict: a.verdict, reason: a.reason, hs: hs ? hs.accepts(r.key) : false, sugg: a.sugg });
  }
  console.log(`shipping-engine verdicts ${Date.now() - t1} ms`);

  const wordTokens = rows.reduce((s, r) => s + r.n, 0);
  const sum = (f: (r: Row) => boolean, byTokens = true) => rows.filter(f).reduce((s, r) => s + (byTokens ? r.n : 1), 0);
  const pct = (x: number, d: number) => `${((100 * x) / d).toFixed(2)}%`;
  console.log(`\n=== SHIPPING ENGINE (class-A packs only) over ${wordTokens} word tokens / ${rows.length} types ===`);
  for (const v of ["VALID", "UNKNOWN", "MISSPELLED"]) {
    const tk = sum((r) => r.verdict === v);
    const ty = sum((r) => r.verdict === v, false);
    console.log(`${v.padEnd(10)} tokens ${tk} (${pct(tk, wordTokens)})   types ${ty} (${pct(ty, rows.length)})`);
  }
  if (hs) {
    const unkHs = rows.filter((r) => r.verdict === "UNKNOWN" && r.hs);
    const unkNotHs = rows.filter((r) => r.verdict === "UNKNOWN" && !r.hs);
    const missHs = rows.filter((r) => r.verdict === "MISSPELLED" && r.hs);
    const missNotHs = rows.filter((r) => r.verdict === "MISSPELLED" && !r.hs);
    const validNotHs = rows.filter((r) => r.verdict === "VALID" && !r.hs);
    console.log(`\nvs Hunspell (second opinion, not ground truth):`);
    console.log(`  UNKNOWN but Hunspell accepts   (coverage gap)         tokens ${tok(unkHs)}  types ${unkHs.length}`);
    console.log(`  UNKNOWN and Hunspell rejects   (names/typos/foreign)   tokens ${tok(unkNotHs)}  types ${unkNotHs.length}`);
    console.log(`  MISSPELLED but Hunspell accepts (FALSE-POSITIVE CANDIDATES) tokens ${tok(missHs)}  types ${missHs.length}`);
    console.log(`  MISSPELLED and Hunspell rejects (agreement)            tokens ${tok(missNotHs)}  types ${missNotHs.length}`);
    console.log(`  VALID but Hunspell rejects     (our acceptance wider)   tokens ${tok(validNotHs)}  types ${validNotHs.length}`);
    const top = (xs: Row[], k: number) => [...xs].sort((a, b) => b.n - a.n).slice(0, k).map((r) => `${r.key}×${r.n}`).join(" ");
    console.log(`\n  top gap words:     ${top(unkHs, 25)}`);
    console.log(`  top FP candidates: ${top(missHs, 25)}`);
    console.log(`  VALID-but-Hunspell-rejects: ${top(validNotHs, 25)}`);
    fs.writeFileSync(
      path.join(outDir, "shipping-vs-hunspell.tsv"),
      ["key\tcount\tverdict\treason\thunspell\tsuggestions", ...[...rows].sort((a, b) => b.n - a.n).map((r) => `${r.key}\t${r.n}\t${r.verdict}\t${r.reason}\t${r.hs}\t${r.sugg}`)].join("\n"),
    );
  }

  if (hs && process.argv.includes("--research")) {
    const policy = JSON.parse(argv("--policy") ?? "{}");
    const dev = createSpellEngineV1({ research: hs, environment: "development", researchPolicy: policy });
    const rr: Row[] = [];
    const t2 = Date.now();
    for (const r of types.values()) {
      const a = judge(dev, r);
      rr.push({ key: r.key, n: r.n, verdict: a.verdict, reason: a.reason, hs: hs.accepts(r.key), sugg: a.sugg });
    }
    console.log(`\nresearch-engine verdicts ${Date.now() - t2} ms`);
    console.log(`=== RESEARCH MODE (class-A packs + local Hunspell oracle) ===`);
    for (const v of ["VALID", "UNKNOWN", "MISSPELLED"]) {
      const f = rr.filter((r) => r.verdict === v);
      console.log(`${v.padEnd(10)} tokens ${tok(f)} (${pct(tok(f), wordTokens)})   types ${f.length}`);
    }
    const flagged = rr.filter((r) => r.verdict === "MISSPELLED").sort((a, b) => b.n - a.n);
    console.log(`flagged types, most frequent first (review these — each is either a real typo or a false positive):`);
    console.log(flagged.slice(0, 80).map((r) => `${r.key}×${r.n}→${r.sugg.split("|")[0]}`).join("  "));
    fs.writeFileSync(path.join(outDir, "research-flagged.tsv"), ["key\tcount\treason\tsuggestions", ...flagged.map((r) => `${r.key}\t${r.n}\t${r.reason}\t${r.sugg}`)].join("\n"));
  }
  hs?.dispose();
}
const tok = (xs: { n: number }[]) => xs.reduce((s, r) => s + r.n, 0);
function argv(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
void main();
