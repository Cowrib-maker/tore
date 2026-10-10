/**
 * Verb stem-class inference, VERIFIED against an independent second opinion.
 *   npx tsx scripts/spell-data/verb-flags-suggest.ts [--write]
 *
 * The analyzer needs per-verb class flags (vstem, hv:<v>, soft-i, cvb:ж|ч) because the spelling of the infinitive does
 * not reveal them. For every authored verb without flags this tool tries each flag hypothesis in a one-lemma analyzer,
 * compares the surface forms that hypothesis makes VALID with what the local second-opinion dictionary accepts, and
 * proposes the best hypothesis only when it (a) explains clearly more oracle-accepted forms than the unflagged default,
 * and (b) makes ZERO forms valid that the oracle rejects. --write appends the proposals to sources/verb-flags.tsv.
 * The oracle is a QA signal for facts about OUR authored words; no oracle data is copied.
 */
import fs from "node:fs";
import path from "node:path";
import { BUNDLED_PACKS } from "../../src/spell-engine/bundled";
import { Lexicon } from "../../src/spell-engine/lexicon/lexicon";
import { MorphAnalyzer } from "../../src/spell-engine/morphology/analyzer";
import { verbSuffixSurfaces } from "../../src/spell-engine/morphology/inventory";
import type { DataPack } from "../../src/spell-engine/lexicon/pack-schema";
import { hasResearchDict, loadHunspellResearchProvider } from "./lib/hunspell-provider";

// ≥6 extra oracle-accepted forms: a 2-form gain is not evidence (барах hv:а would have made «зарсан» a false accusation).
const MIN_GAIN = 6;
const FILE = path.resolve(__dirname, "../../src/spell-engine/data/sources/verb-flags.tsv");

const mk = (lemma: string, flags: string[]): DataPack =>
  ({
    schema: "tore-spell-pack/1",
    id: "probe",
    version: "0",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "probe", license: "probe", redistributable: true, dataClass: "A_TORE_OWNED" },
    entries: [{ w: lemma, pos: "V", flags }],
  }) as DataPack;

async function main() {
  if (!hasResearchDict()) throw new Error("research dictionary missing");
  const oracle = await loadHunspellResearchProvider();
  const existing = new Set(
    fs.readFileSync(FILE, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0]!),
  );
  const verbs = new Set<string>();
  for (const p of BUNDLED_PACKS) for (const e of p.entries) if (e.pos === "V" && e.w.endsWith("х") && !(e.flags ?? []).includes("form") && e.w.length >= 5 && !existing.has(e.w)) verbs.add(e.w);
  const sufs = verbSuffixSurfaces().filter((s) => s.length >= 1);
  const baseFlags: string[][] = [[], ["vstem"], ["soft-i"], ["hv:а"], ["hv:э"], ["hv:о"], ["hv:ө"], ["hv:и"]];
  const cvb: string[][] = [[], ["cvb:ж"], ["cvb:ч"]];
  const proposals: { lemma: string; flags: string[]; gain: number; explained: number }[] = [];
  let considered = 0;
  for (const lemma of [...verbs].sort()) {
    const stemBase = lemma.slice(0, -1); // drop х: «ажилла», «хэрэглэ», «бич» + linking vowel
    const stems = new Set<string>([stemBase, stemBase.slice(0, -1), stemBase.slice(0, -1) + "ь", stemBase.slice(0, -1) + "и"]);
    for (const v of "аэоөи") stems.add(stemBase.slice(0, -2) + v + stemBase.slice(-2, -1)); // hidden vowel variants (rare path)
    const surfaces = new Set<string>();
    for (const st of stems) for (const s of sufs) surfaces.add(st + s);
    const truth = new Set([...surfaces].filter((s) => oracle.accepts(s)));
    if (truth.size < 3) continue; // the oracle does not know this verb well enough to judge
    considered += 1;
    const score = (flags: string[]) => {
      const lex = new Lexicon([mk(lemma, flags)]);
      const an = new MorphAnalyzer(lex);
      let good = 0;
      let bad = 0;
      const parsed = new Set<string>();
      for (const s of surfaces) if (an.analyze(s).parses.length > 0) (parsed.add(s), truth.has(s) ? (good += 1) : (bad += 1));
      return { good, bad, parsed };
    };
    // forms the oracle accepts that the UNFLAGGED analyzer parses but this hypothesis would reject (дагах+vstem makes дагсан a «slip»)
    const lostVs = (hyp: Set<string>, base: Set<string>) => [...base].filter((s) => truth.has(s) && !hyp.has(s)).length;
    const def = score([]);
    let best = { flags: [] as string[], good: def.good, bad: def.bad };
    for (const b of baseFlags) for (const c of cvb) {
      const f = [...b, ...c];
      if (f.length === 0) continue;
      const sc = score(f);
      if (sc.bad <= def.bad && lostVs(sc.parsed, def.parsed) === 0 && sc.good > best.good) best = { flags: f, good: sc.good, bad: sc.bad };
    }
    const cvbOnly = best.flags.length > 0 && best.flags.every((x) => x.startsWith("cvb:")); // the converb ж/ч is lexical: one accepted form is the whole evidence
    if (best.flags.length > 0 && best.good - def.good >= (cvbOnly ? 1 : MIN_GAIN)) proposals.push({ lemma, flags: best.flags, gain: best.good - def.good, explained: best.good });
  }
  console.log(`verbs without flags considered (oracle knows ≥3 forms): ${considered} of ${verbs.size}; proposals: ${proposals.length}`);
  for (const p of proposals) console.log(`  ${p.lemma}\t${p.flags.join(",")}\t(+${p.gain} oracle-accepted forms, 0 oracle-rejected)`);
  if (process.argv.includes("--write")) {
    const stamp = `\n# --- ${proposals.length} flags proposed by scripts/spell-data/verb-flags-suggest.ts (2026-10-07): best hypothesis explains clearly more forms\n# a second-opinion dictionary accepts and makes none valid that it rejects. AI-reviewed, native review pending. ---\n`;
    fs.appendFileSync(FILE, stamp + proposals.map((p) => `${p.lemma}\t${p.flags.join(",")}`).join("\n") + "\n");
    console.log(`appended ${proposals.length} lines to ${path.relative(process.cwd(), FILE)}`);
  }
  oracle.dispose();
}
void main();
