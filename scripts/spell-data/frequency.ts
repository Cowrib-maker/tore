/**
 * Stage — frequency: count case-folded word types over a local corpus.
 *   npx tsx scripts/spell-data/frequency.ts [--limit N]
 * Output (LOCAL ONLY, derived from class-D data, never bundled):
 *   .spell-research/derived/freq-eduge.tsv   key \t count \t lowerCount
 * `lowerCount` = occurrences written entirely in lower case (names are mostly
 * capitalised, so a low lowerCount/count ratio marks a likely proper noun).
 */
import fs from "node:fs";
import path from "node:path";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";

export const FREQ_FILE = path.resolve(__dirname, "../../.spell-research/derived/freq-eduge.tsv");

async function main() {
  if (!hasEduge()) throw new Error("Eduge not present: run scripts/spell-data/fetch-research.ts");
  const i = process.argv.indexOf("--limit");
  const limit = i === -1 ? Infinity : Number(process.argv[i + 1]);
  const counts = new Map<string, [number, number]>();
  let tokens = 0;
  let docs = 0;
  const t0 = Date.now();
  for await (const doc of eduge(limit)) {
    docs += 1;
    for (const t of lex(doc.text)) {
      if (t.kind !== "WORD") continue;
      tokens += 1;
      const key = normalizeToken(t.text);
      const c = counts.get(key) ?? [0, 0];
      c[0] += 1;
      if (t.caseShape === "LOWER") c[1] += 1;
      counts.set(key, c);
    }
    if (docs % 10000 === 0) console.log(`${docs} docs, ${tokens} tokens, ${counts.size} types`);
  }
  fs.mkdirSync(path.dirname(FREQ_FILE), { recursive: true });
  const lines = [`# tokens=${tokens} docs=${docs} source=eduge (class D, local only)`];
  for (const [k, [n, l]] of [...counts].sort((a, b) => b[1][0] - a[1][0])) lines.push(`${k}\t${n}\t${l}`);
  fs.writeFileSync(FREQ_FILE, lines.join("\n"));
  console.log(`done: ${docs} docs, ${tokens} tokens, ${counts.size} types in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${path.relative(process.cwd(), FREQ_FILE)}`);
}
if (require.main === module) void main();
