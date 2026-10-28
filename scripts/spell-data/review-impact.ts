/**
 * How much coverage does one native-reviewer decision buy? (planning tool; DEV slice only — never the frozen holdout)
 *   npx tsx scripts/spell-data/review-impact.ts [--max-doc 40000]
 * For the UNKNOWN word types of the dev slice, ranked by token count, prints the cumulative share of ALL dev word tokens that the top-K types
 * account for, per category. It is an UPPER BOUND on the coverage a reviewer could add by approving the top-K types: it assumes every
 * approved type is a genuine word (a reviewer will reject some: typos, wrong spellings), counts each surface form as one decision (a reviewed
 * LEMMA also unlocks its inflected forms, so lemma-level review is worth more), and uses the local second-opinion dictionary only to rank
 * the queue («likely valid» types first). It changes no data and makes no word VALID.
 * Writes .spell-research/out/review-impact.tsv (word, tokens, category) for building a local reviewer packet; nothing is committed.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";
import { buildClassifier, type Category, type TypeRec } from "./lib/taxonomy-lib";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

async function main() {
  const maxDoc = Number(arg("--max-doc", "40000"));
  if (maxDoc > 40_000) throw new Error("dev slice only: --max-doc ≤ 40000 (the frozen holdout is never used to plan work)");
  const freq = loadFrequencyTable(FREQ_FILE);
  const hs = await loadHunspellResearchProvider(freq);
  const eng = createSpellEngineV1();
  const types = new Map<string, TypeRec>();
  let words = 0;
  for await (const d of eduge(maxDoc, 0)) {
    if (d.id % 4 !== 1) continue;
    for (const t of lex(d.text)) {
      if (t.kind !== "WORD") continue;
      words += 1;
      const key = normalizeToken(t.text);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      const r = types.get(key);
      if (r) (r.n += 1, (r.titleOnly = r.titleOnly && title));
      else types.set(key, { key, n: 1, titleOnly: title, upperOnly: false, sample: t.text });
    }
  }
  const classify = buildClassifier(eng, hs, freq);
  const rows: { w: string; n: number; cat: Category; ok: boolean }[] = [];
  let unknown = 0;
  for (const t of types.values()) {
    if (eng.analyze(`и ${t.titleOnly ? t.sample : t.key}`).tokens[1]!.verdict !== "UNKNOWN") continue;
    unknown += t.n;
    rows.push({ w: t.key, n: t.n, cat: classify(t).cat, ok: hs.accepts(t.key) });
  }
  console.log(`dev slice: ${words} word tokens, ${types.size} types; UNKNOWN ${unknown} tokens (${((100 * unknown) / words).toFixed(2)}%) in ${rows.length} types`);
  const groups: [string, (r: (typeof rows)[number]) => boolean][] = [
    ["lemma gaps (MISSING_LEMMA + LOANWORD + TECHNICAL), dictionary-accepted", (r) => r.ok && ["MISSING_LEMMA", "LOANWORD", "TECHNICAL_TERM"].includes(r.cat)],
    ["forms (MISSING_INFLECTION + DERIVATIONAL + COMPOUND), dictionary-accepted", (r) => r.ok && ["MISSING_INFLECTION", "DERIVATIONAL_FORM", "COMPOUND"].includes(r.cat)],
    ["ALL UNKNOWN types, dictionary-accepted", (r) => r.ok],
  ];
  const Ks = [250, 500, 1000, 2000, 5000, 10000, 20000];
  for (const [name, pick] of groups) {
    const g = rows.filter(pick).sort((a, b) => b.n - a.n);
    const total = g.reduce((s, r) => s + r.n, 0);
    let acc = 0;
    const curve: string[] = [];
    let k = 0;
    for (const K of Ks) {
      for (; k < Math.min(K, g.length); k += 1) acc += g[k]!.n;
      curve.push(`${K}: +${((100 * acc) / words).toFixed(2)}pp`);
    }
    console.log(`\n${name}\n  ${g.length} types / ${total} tokens (${((100 * total) / words).toFixed(2)}% of dev tokens). Upper bound if the top-K types are approved:\n  ${curve.join("  ")}`);
  }
  const out = path.resolve(__dirname, "../../.spell-research/out/review-impact.tsv");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rows.filter((r) => r.ok).sort((a, b) => b.n - a.n).map((r) => `${r.w}\t${r.n}\t${r.cat}`).join("\n"));
  console.log(`\nwrote ${path.relative(process.cwd(), out)} (local, not committed)`);
  hs.dispose();
}
void main();
