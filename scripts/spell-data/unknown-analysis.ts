/**
 * Why is a token UNKNOWN? (turns the UNKNOWN rate into engineering work)
 *   npx tsx scripts/spell-data/unknown-analysis.ts [--limit 1500] [--engine shipping|research]
 *
 * Every UNKNOWN word type from a local corpus is put in exactly one bucket:
 *   TOKENIZER      stray fragments the lexer should have protected (single letters, glued junk)
 *   PROPER_NOUN    (nearly) always written capitalised in running text
 *   MISSING_MORPH  a known lemma + a plausible suffix string, yet the analyzer rejects it
 *   MISSING_LEMMA  the second-opinion dictionary accepts it, no known lemma explains it
 *   NEW_OR_RARE    low frequency and not accepted by the dictionary (neologism, rare word, typo)
 *   LIKELY_TYPO    rare, rejected by the dictionary, with a close valid neighbour
 *   FOREIGN_OR_NAME  rejected by the dictionary, moderately frequent (loanword / uncatalogued name)
 * The corpus and the dictionary are local research data; this tool only counts and ranks.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";
import { nounSuffixes, verbSuffixes } from "./lib/suffix-inventory";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

async function main() {
  if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
  const limit = Number(arg("--limit", "1500"));
  const freq = loadFrequencyTable(FREQ_FILE);
  const hs = await loadHunspellResearchProvider(freq);
  const eng = createSpellEngineV1();
  type T = { key: string; n: number; titleOnly: boolean; sample: string };
  const types = new Map<string, T>();
  let tokens = 0;
  for await (const doc of eduge(limit)) {
    for (const t of lex(doc.text)) {
      if (t.kind !== "WORD") continue;
      tokens += 1;
      const key = normalizeToken(t.text);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      const r = types.get(key);
      if (r) (r.n += 1, (r.titleOnly = r.titleOnly && title));
      else types.set(key, { key, n: 1, titleOnly: title, sample: t.text });
    }
  }
  const lemmas = new Set<string>();
  for (const k of eng.lexicon.keys()) lemmas.add(k);
  const suffixes = new Set([...nounSuffixes(), ...verbSuffixes()]);
  // a remainder is "plausibly a suffix chain" if it is one inventory piece or two glued pieces
  const isChain = (r: string): boolean => suffixes.has(r) || [...suffixes].some((a) => r.startsWith(a) && suffixes.has(r.slice(a.length)));
  const restHist = new Map<string, { n: number; ex: string[] }>();
  const cats = new Map<string, { tokens: number; types: number; top: string[] }>();
  const bump = (c: string, t: T) => {
    const x = cats.get(c) ?? { tokens: 0, types: 0, top: [] };
    x.tokens += t.n;
    x.types += 1;
    x.top.push(`${t.key}×${t.n}`);
    cats.set(c, x);
  };
  let unknownTokens = 0;
  const unknownTypes: T[] = [];
  for (const t of types.values()) {
    const text = `и ${t.titleOnly ? t.sample : t.key}`;
    const r = eng.analyze(text);
    if (r.tokens[1]!.verdict !== "UNKNOWN") continue;
    unknownTokens += t.n;
    unknownTypes.push(t);
    const k = t.key;
    const pm = freq ? freq.pm(k) : 0;
    const name = freq ? freq.name(k) : 0;
    const inDict = hs.accepts(k);
    if (k.length <= 1) bump("TOKENIZER", t);
    else if (name > 0.6 || (!freq && t.titleOnly)) bump("PROPER_NOUN", t);
    else {
      // a known lemma (or its elided / ь / dropped-vowel variants) followed by a plausible suffix chain
      let hasLemma = false;
      for (let i = Math.min(k.length - 1, 12); i >= 2 && !hasLemma; i -= 1) {
        const head = k.slice(0, i);
        const rest = k.slice(i);
        if (!isChain(rest)) continue;
        const found = lemmas.has(head) || lemmas.has(`${head}ь`) || ["а", "э", "о", "ө", "и", "у", "ү"].some((v) => lemmas.has(`${head.slice(0, -1)}${v}${head.slice(-1)}`)) || ["а", "э", "о", "ө"].some((v) => lemmas.has(`${head}${v}`));
        if (found) {
          hasLemma = true;
          if (inDict) {
            const h = restHist.get(rest) ?? { n: 0, ex: [] };
            h.n += t.n;
            if (h.ex.length < 4) h.ex.push(k);
            restHist.set(rest, h);
          }
        }
      }
      if (inDict && hasLemma) bump("MISSING_MORPH", t);
      else if (inDict) bump("MISSING_LEMMA", t);
      else if (pm < 0.5) bump(t.n <= 2 ? "LIKELY_TYPO_OR_RARE" : "NEW_OR_RARE", t);
      else bump("FOREIGN_OR_NAME", t);
    }
  }
  console.log(`corpus: ${tokens} word tokens, ${types.size} types; UNKNOWN ${unknownTokens} tokens (${((100 * unknownTokens) / tokens).toFixed(1)}%), ${unknownTypes.length} types`);
  const rows = [...cats].sort((a, b) => b[1].tokens - a[1].tokens);
  const out: string[] = ["category\ttokens\tshareOfUnknown\ttypes\ttop"];
  for (const [c, x] of rows) {
    const top = x.top.sort((a, b) => Number(b.split("×")[1]) - Number(a.split("×")[1])).slice(0, 14);
    console.log(`${c.padEnd(22)} ${String(x.tokens).padStart(8)} tokens (${((100 * x.tokens) / unknownTokens).toFixed(1)}% of unknown)  ${String(x.types).padStart(6)} types   ${top.slice(0, 8).join(" ")}`);
    out.push(`${c}\t${x.tokens}\t${((100 * x.tokens) / unknownTokens).toFixed(2)}\t${x.types}\t${top.join(" ")}`);
  }
  console.log(`\nMISSING_MORPH by suffix string (analyzer rejects lemma+suffix although a second opinion accepts): ${[...restHist].sort((a, b) => b[1].n - a[1].n).slice(0, 25).map(([r, h]) => `-${r}×${h.n}(${h.ex.slice(0, 2).join(',')})`).join(' ')}`);
  const file = path.resolve(__dirname, "../../.spell-research/out/unknown-reasons.tsv");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.join("\n"));
  hs.dispose();
}
void main();
