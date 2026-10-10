/**
 *   npx tsx scripts/spell-data/audit-verb-flags.ts [--remove]
 * Audit every line of sources/verb-flags.tsv against the local second-opinion dictionary: a flag must not make a form
 * INVALID that the oracle accepts and the unflagged analyzer parses (дагах+vstem would turn the valid дагсан into a «slip»).

 * ADVISORY: a lost form may belong to a HOMOGRAPH stem (хорих/хорох, тавих/тавах), so review the list before --remove.
 * Conflicting lines are listed; --remove deletes them from verb-flags.tsv (the verb then falls back to the unflagged default).
 */
import fs from "node:fs";
import path from "node:path";
import { Lexicon } from "../../src/spell-engine/lexicon/lexicon";
import { MorphAnalyzer } from "../../src/spell-engine/morphology/analyzer";
import { verbSuffixSurfaces } from "../../src/spell-engine/morphology/inventory";
import type { DataPack } from "../../src/spell-engine/lexicon/pack-schema";
import { loadHunspellResearchProvider } from "./lib/hunspell-provider";

const FILE = path.resolve(__dirname, "../../src/spell-engine/data/sources/verb-flags.tsv");
const mk = (lemma: string, flags: string[]): DataPack =>
  ({ schema: "tore-spell-pack/1", id: "probe", version: "0", layer: "GENERAL", language: "mn-Cyrl", coverage: "SEED", provenance: { source: "probe", license: "probe", redistributable: true, dataClass: "A_TORE_OWNED" }, entries: [{ w: lemma, pos: "V", flags }] }) as DataPack;

async function main() {
  const oracle = await loadHunspellResearchProvider();
  const lines = fs.readFileSync(FILE, "utf8").split("\n");
  const bad = new Set<string>();
  for (const l of lines) {
    if (!l || l.startsWith("#")) continue;
    const [lemma, f] = l.split("\t");
    if (!lemma || !f || !lemma.endsWith("х")) continue;
    const base = lemma.slice(0, -1);
    const surfaces = new Set<string>();
    for (const st of [base, base.slice(0, -1), base.slice(0, -1) + "ь", base.slice(0, -1) + "и"]) for (const s of verbSuffixSurfaces()) surfaces.add(st + s);
    const parse = (flags: string[]) => {
      const an = new MorphAnalyzer(new Lexicon([mk(lemma, flags)]));
      return new Set([...surfaces].filter((s) => an.analyze(s).parses.length > 0));
    };
    const withF = parse(f.split(","));
    const without = parse([]);
    const lost = [...without].filter((s) => oracle.accepts(s) && !withF.has(s));
    if (lost.length > 0) {
      bad.add(lemma);
      console.log(`${lemma}\t${f}\tLOSES oracle-accepted: ${lost.slice(0, 6).join(", ")}`);
    }
  }
  console.log(`conflicting flag lines: ${bad.size}`);
  if (process.argv.includes("--remove") && bad.size) {
    fs.writeFileSync(FILE, lines.filter((l) => !(l && !l.startsWith("#") && bad.has(l.split("\t")[0]!))).join("\n"));
    console.log(`removed ${bad.size} lines`);
  }
  oracle.dispose();
}
void main();
