/**
 * Ranked UNKNOWN taxonomy (10 categories) over a LOCAL corpus.
 *   npx tsx scripts/spell-data/unknown-taxonomy.ts [--limit 6000] [--engine shipping] [--top 25]
 *
 * Every UNKNOWN word TYPE lands in exactly one category (first match wins, in this order):
 *   TOKENIZER_FAILURE  stray letters / glued junk the lexer should have protected
 *   ABBREVIATION       written in capitals in running text (all occurrences)
 *   PROPER_NAME        (nearly) always capitalised, or name-likelihood high in the frequency table
 *   COMPOUND           splits into two known lemmas (each ≥3 letters), optionally + suffix chain
 *   DERIVATIONAL_FORM  known lemma + a DERIVATIONAL suffix (-лаг, -лт, -гч …) (+ inflection)
 *   MISSING_INFLECTION a known lemma + a plausible inflectional suffix chain that the analyzer rejects
 *   LOANWORD           not accepted by the second-opinion dictionary, loan-like orthography / ending
 *   TECHNICAL_TERM     Greek/Latin-style technical stem or ending (-логи, -метр, -граф …)
 *   MISSING_LEMMA      the dictionary accepts it; no known lemma explains it
 *   TRUE_UNKNOWN       everything else (rare words, typos, uncatalogued names)
 * Classification is a HEURISTIC to rank engineering work, never evidence for accepting a word: nothing here makes a
 * word VALID. The corpus and the dictionary are local research data (class C/D); this tool only counts and ranks.
 * Writes .spell-research/out/unknown-taxonomy.tsv (word, tokens, category, evidence) for follow-up tools.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";
import { buildClassifier, type Category, type TypeRec } from "./lib/taxonomy-lib";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);



async function main() {
  if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
  const limit = Number(arg("--limit", "6000"));
  const top = Number(arg("--top", "25"));
  const freq = loadFrequencyTable(FREQ_FILE);
  const hs = await loadHunspellResearchProvider(freq);
  const eng = createSpellEngineV1();
  type T = TypeRec;
  const types = new Map<string, T>();
  let tokens = 0;
  const skip = Number(arg("--skip", "0"));
  for await (const doc of eduge(limit, skip)) {
    for (const t of lex(doc.text)) {
      if (t.kind !== "WORD" && t.kind !== "ACRONYM") continue;
      tokens += 1;
      const key = normalizeToken(t.text);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      const upper = t.caseShape === "UPPER" && t.text.length > 1;
      const r = types.get(key);
      if (r) (r.n += 1, (r.titleOnly = r.titleOnly && title), (r.upperOnly = r.upperOnly && upper));
      else types.set(key, { key, n: 1, titleOnly: title, upperOnly: upper, sample: t.text });
    }
  }

  const classify = buildClassifier(eng, hs, freq);

  const rows: { w: string; n: number; cat: Category; ev: string }[] = [];
  const cats = new Map<Category, { tokens: number; types: number }>();
  let unknownTokens = 0;
  for (const t of types.values()) {
    const r = eng.analyze(`и ${t.titleOnly ? t.sample : t.key}`);
    if (r.tokens[1]!.verdict !== "UNKNOWN") continue;
    unknownTokens += t.n;
    const c = classify(t);
    rows.push({ w: t.key, n: t.n, cat: c.cat, ev: c.evidence });
    const x = cats.get(c.cat) ?? { tokens: 0, types: 0 };
    x.tokens += t.n;
    x.types += 1;
    cats.set(c.cat, x);
  }
  console.log(`corpus: ${tokens} tokens, ${types.size} types; UNKNOWN ${unknownTokens} tokens (${((100 * unknownTokens) / tokens).toFixed(2)}% of corpus)`);
  for (const [c, x] of [...cats].sort((a, b) => b[1].tokens - a[1].tokens)) {
    const best = rows.filter((r) => r.cat === c).sort((a, b) => b.n - a.n).slice(0, 10).map((r) => `${r.w}×${r.n}${r.ev.includes("+") ? `(${r.ev})` : ""}`);
    console.log(`${c.padEnd(19)} ${String(x.tokens).padStart(7)} tokens ${((100 * x.tokens) / unknownTokens).toFixed(1).padStart(5)}% of UNKNOWN ${((100 * x.tokens) / tokens).toFixed(2).padStart(5)}% of corpus ${String(x.types).padStart(6)} types  ${best.slice(0, top > 10 ? 10 : top).join(" ")}`);
  }
  const out = path.resolve(__dirname, skip > 0 ? "../../.spell-research/out/unknown-taxonomy-heldout.tsv" : "../../.spell-research/out/unknown-taxonomy.tsv");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rows.sort((a, b) => b.n - a.n).map((r) => `${r.w}\t${r.n}\t${r.cat}\t${r.ev}`).join("\n"));
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
  hs.dispose();
}
void main();
