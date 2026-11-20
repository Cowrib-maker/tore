/**
 * Vocabulary QA against INDEPENDENT oracles (local, class C/D — never bundled).
 *   npx tsx scripts/spell-data/vocab-qa.ts [--layer GENERAL] [--out .spell-research/out/vocab-qa.tsv]
 *
 * For every authored lemma of the bundled structured vocabulary packs:
 *  1. lemma-level: does the second-opinion dictionary accept the lemma?  (rejected ⇒ review)
 *  2. paradigm-level (nouns, verbs): generate surface candidates (lemma × suffix inventory),
 *     keep those OUR analyzer accepts, and measure how many the oracle rejects.
 *     A lemma whose generated paradigm is mostly rejected is probably mis-classified.
 *  3. gap-level: surfaces the oracle accepts but OUR analyzer rejects = missing morphology candidates.
 * The oracle is a second opinion, not truth: this tool produces a review list, it never edits data.
 */
import fs from "node:fs";
import path from "node:path";
import { BUNDLED_PACKS, createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { NOUN_CASE, NOUN_PLURAL, REFLEXIVE_AFTER_CONSONANT, REFLEXIVE_AFTER_VOWEL, VERB_GROUPS } from "../../src/spell-engine/morphology/suffixes";
import { hasResearchDict, loadHunspellResearchProvider } from "./lib/hunspell-provider";

const arg = (n: string, d?: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);

function nounSuffixes(): string[] {
  const out = new Set<string>();
  const add = (x: string | null) => x && out.add(x);
  for (const vs of Object.values(NOUN_PLURAL)) for (const v of vs) (add(v.M), add(v.F));
  for (const gs of Object.values(NOUN_CASE)) for (const g of gs) for (const v of g.variants) (add(v.M), add(v.F));
  for (const v of [...REFLEXIVE_AFTER_CONSONANT, ...REFLEXIVE_AFTER_VOWEL]) (add(v.M), add(v.F));
  return [...out];
}
function verbSuffixes(): string[] {
  const out = new Set<string>();
  for (const g of VERB_GROUPS) for (const v of [...g.afterC, ...g.afterV]) for (const x of [v.M, v.F]) if (x) out.add(x);
  return [...out];
}

async function main() {
  if (!hasResearchDict()) throw new Error("research dictionary missing: run `pipeline fetch`");
  const layerFilter = arg("--layer");
  const oracle = await loadHunspellResearchProvider();
  const eng = createSpellEngineV1();
  const nS = nounSuffixes();
  const vS = verbSuffixes();
  type Row = { lemma: string; pack: string; pos: string; lemmaOk: boolean; gen: number; genRejected: number; gaps: string[] };
  const rows: Row[] = [];
  const gapCount = new Map<string, number>();
  for (const pack of BUNDLED_PACKS) {
    if (!pack.id.startsWith("tore-vocab-")) continue;
    if (layerFilter && pack.layer !== layerFilter) continue;
    if (pack.layer === "PROPER_NOUN" || pack.layer === "ABBREVIATION") continue;
    for (const e of pack.entries) {
      const flags = e.flags ?? [];
      if (flags.includes("form") || flags.includes("no-infl")) {
        rows.push({ lemma: e.w, pack: pack.id, pos: e.pos ?? "X", lemmaOk: oracle.accepts(e.w), gen: 0, genRejected: 0, gaps: [] });
        continue;
      }
      let surfaces: string[] = [];
      if (e.pos === "N" || e.pos === "ADJ") surfaces = nS.map((s) => e.w + s);
      else if (e.pos === "V" && e.w.endsWith("х")) {
        const base = e.w.slice(0, -1);
        const stems = new Set([base, base.slice(0, -1), base.slice(0, -1) + "и"]);
        for (const st of stems) for (const s of vS) surfaces.push(st + s.replace("~", ""));
      }
      let gen = 0;
      let rej = 0;
      const gaps: string[] = [];
      for (const s of new Set(surfaces)) {
        const mine = eng.checkWord(s).verdict === "VALID";
        const theirs = oracle.accepts(s);
        if (mine) {
          gen += 1;
          if (!theirs) rej += 1;
        } else if (theirs && e.pos !== "V") {
          gaps.push(s.slice(e.w.length));
          gapCount.set(s.slice(e.w.length), (gapCount.get(s.slice(e.w.length)) ?? 0) + 1);
        }
      }
      rows.push({ lemma: e.w, pack: pack.id, pos: e.pos ?? "X", lemmaOk: oracle.accepts(e.w), gen, genRejected: rej, gaps });
    }
  }
  const rejectedLemmas = rows.filter((r) => !r.lemmaOk);
  const suspect = rows.filter((r) => r.gen >= 3 && r.genRejected / r.gen >= 0.4);
  console.log(`lemmas checked ${rows.length}; lemma rejected by oracle ${rejectedLemmas.length}; suspect paradigms ${suspect.length}`);
  console.log(`generated forms accepted by us: ${rows.reduce((s, r) => s + r.gen, 0)}; of which oracle rejects: ${rows.reduce((s, r) => s + r.genRejected, 0)}`);
  console.log(`REJECTED LEMMAS (review each): ${rejectedLemmas.map((r) => r.lemma).join(" ")}`);
  console.log(`SUSPECT PARADIGMS: ${suspect.map((r) => `${r.lemma}(${r.genRejected}/${r.gen})`).join(" ")}`);
  console.log(`TOP MORPHOLOGY GAPS (suffix the oracle accepts, we reject; count of lemmas): ${[...gapCount].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k}×${v}`).join(" ")}`);
  const out = arg("--out", path.resolve(__dirname, "../../.spell-research/out/vocab-qa.tsv"))!;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, ["lemma\tpack\tpos\tlemmaOracle\tgenerated\tgeneratedRejected\tgaps", ...rows.map((r) => `${r.lemma}\t${r.pack}\t${r.pos}\t${r.lemmaOk}\t${r.gen}\t${r.genRejected}\t${r.gaps.join(",")}`)].join("\n"));
  oracle.dispose();
}
void main();
