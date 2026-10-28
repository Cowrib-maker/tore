/**
 * Noun stem-class inference («hidden г»), VERIFIED against an independent second opinion.
 *   npx tsx scripts/spell-data/noun-flags-suggest.ts [--write]
 *
 * Some н-final nouns carry a hidden «г» that surfaces before a suffix (байшин → байшингийн, үзэсгэлэн → үзэсгэлэнгийн).
 * The class cannot be read off the spelling. For every authored н-final noun without the flag, this tool compares the surface
 * forms the two hypotheses make VALID with what the local second-opinion dictionary accepts, and proposes `hidden-g` only
 * when it (a) explains at least MIN_GAIN more oracle-accepted forms and (b) makes NO MORE forms valid that the oracle rejects than the unflagged default (the noun grammar over-generates a little, so zero is unattainable).
 * --write appends the proposals to sources/noun-flags.tsv. The oracle is a QA signal for facts about OUR authored words;
 * no oracle data is copied.
 */
import fs from "node:fs";
import path from "node:path";
import { BUNDLED_PACKS } from "../../src/spell-engine/bundled";
import { Lexicon } from "../../src/spell-engine/lexicon/lexicon";
import { MorphAnalyzer } from "../../src/spell-engine/morphology/analyzer";
import { nounSuffixSurfaces } from "../../src/spell-engine/morphology/inventory";
import type { DataPack } from "../../src/spell-engine/lexicon/pack-schema";
import { hasResearchDict, loadHunspellResearchProvider } from "./lib/hunspell-provider";

const MIN_GAIN = 4;
const FILE = path.resolve(__dirname, "../../src/spell-engine/data/sources/noun-flags.tsv");

const mk = (lemma: string, flags: string[]): DataPack =>
  ({
    schema: "tore-spell-pack/1",
    id: "probe",
    version: "0",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "probe", license: "probe", redistributable: true, dataClass: "A_TORE_OWNED" },
    entries: [{ w: lemma, pos: "N", flags }],
  }) as DataPack;

async function main() {
  if (!hasResearchDict()) throw new Error("research dictionary missing");
  const oracle = await loadHunspellResearchProvider();
  const existing = new Set(fs.readFileSync(FILE, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0]!));
  const nouns = new Set<string>();
  for (const p of BUNDLED_PACKS) for (const e of p.entries) if (e.pos === "N" && e.w === e.w.toLowerCase() && e.w.endsWith("н") && !(e.flags ?? []).includes("form") && !(e.flags ?? []).includes("hidden-g") && e.w.length >= 4 && !existing.has(e.w)) nouns.add(e.w);
  const sufs = nounSuffixSurfaces().filter((s) => s.length >= 1);
  const proposals: { lemma: string; gain: number }[] = [];
  let considered = 0;
  let skippedPoorOracle = 0;
  for (const lemma of [...nouns].sort()) {
    const surfaces = new Set<string>();
    for (const s of sufs) (surfaces.add(lemma + s), surfaces.add(`${lemma}г${s}`));
    const truth = new Set([...surfaces].filter((s) => oracle.accepts(s)));
    if (truth.size < 4) {
      skippedPoorOracle += 1;
      continue;
    }
    considered += 1;
    const score = (flags: string[]) => {
      const an = new MorphAnalyzer(new Lexicon([mk(lemma, flags)]));
      let good = 0;
      let bad = 0;
      for (const s of surfaces) if (an.analyze(s).parses.length > 0) (truth.has(s) ? (good += 1) : (bad += 1));
      return { good, bad };
    };
    const def = score([]);
    const hyp = score(["hidden-g"]);
    if (hyp.bad <= def.bad && hyp.good - def.good >= MIN_GAIN) proposals.push({ lemma, gain: hyp.good - def.good });
  }
  console.log(`н-final nouns without a flag: ${nouns.size}; judged ${considered} (oracle knows ≥4 forms), ${skippedPoorOracle} skipped; proposals: ${proposals.length}`);
  for (const p of proposals) console.log(`  ${p.lemma}\thidden-g\t(+${p.gain} oracle-accepted forms, 0 oracle-rejected)`);
  if (process.argv.includes("--write") && proposals.length) {
    fs.appendFileSync(FILE, `# --- ${proposals.length} flags proposed by scripts/spell-data/noun-flags-suggest.ts (2026-10-07): explain ≥${MIN_GAIN} more forms a second-opinion dictionary accepts and make none valid that it rejects. AI-reviewed, native review pending. ---\n` + proposals.map((p) => `${p.lemma}\thidden-g`).join("\n") + "\n");
    console.log(`appended ${proposals.length} lines to ${path.relative(process.cwd(), FILE)}`);
  }
  oracle.dispose();
}
void main();
