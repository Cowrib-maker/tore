/**
 * TORE Spell Language Engine V1 benchmark.
 *   npx tsx scripts/benchmark-spell-engine.ts [--json out.json]
 * Reference datasets (dict-mn, UniMorph) are NEVER bundled; the oracle script
 * reads them from local paths given by env vars (see docs/spell/BENCHMARK.md).
 */
import fs from "node:fs";
import { bundledEngine, runBenchmark, runLegacyComparison, simulatedBroadEngine } from "../tests/evaluation/spell-v1/run-benchmark";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ms = (x: number) => x.toFixed(3);

function print(title: string, r: ReturnType<typeof runBenchmark>) {
  console.log(`\n=== ${title} ===`);
  console.log(`engine ${r.engineVersion} | data ${r.dataPackVersion} | lexicon ${r.perf.lexiconSize} entries | seed ${r.seed}`);
  console.log(`A clean text: ${r.clean.words} words, MISSPELLED(FP)=${r.clean.falsePositives} (${r.clean.fpPer1000Words.toFixed(2)}/1000w), valid ${pct(r.clean.validRate)}, unknown ${pct(r.clean.unknownRate)}${r.clean.fpWords.length ? " FP: " + r.clean.fpWords.join(",") : ""}`);
  const p = r.paradigms;
  console.log(`B paradigms: valid accepted ${p.acceptedAsValid}/${p.validForms} (${pct(p.acceptanceRate)}), false MISSPELLED=${p.falseMisspelled}, rejected: ${p.rejected.join(",") || "-"}`);
  console.log(`  invalid forms flagged ${p.invalidFlagged}/${p.invalidForms}, top-1 correct ${p.invalidTop1}${p.invalidWrongFix.length ? " wrong: " + p.invalidWrongFix.join(",") : ""}; protected flagged ${p.protectedFlagged}/${p.protectedTokens} ${p.protectedFlaggedList.join(",")}`);
  const s = r.synthetic;
  console.log(`C synthetic (${s.injected} injected): detect ${pct(s.detectionRate)}, sugg-precision ${pct(s.suggestionPrecision)}, recall ${pct(s.suggestionRecall)}, F0.5 ${s.f05.toFixed(3)}, top1 ${pct(s.top1)}, top3 ${pct(s.top3)}, MRR ${s.mrr.toFixed(3)}, abstain ${pct(s.abstentionRate)}`);
  for (const [k, v] of Object.entries(s.perKind)) console.log(`    ${k}: n=${v.n} flagged=${v.flagged} top1=${v.top1}`);
  for (const [cls, b] of Object.entries(r.gold)) console.log(`D gold ${cls}: ${b.ok}/${b.total}${b.failures.length ? "  fail: " + b.failures.join(" | ") : ""}`);
  console.log(`  dangerous pairs flagged: ${r.dangerous.flagged}/${r.dangerous.pairs * 2} ${r.dangerous.list.join(",")}`);
  const vg = r.verbGold;
  console.log(`F ${vg.dataset} [${vg.datasetClass}; ${vg.reviewStatus}]: ${vg.lemmaRecords} lemma records, ${vg.records} records, native-reviewed records: ${vg.nativeReviewedRecords}`);
  console.log(`  VALID accepted ${vg.accepted}/${vg.valid} (${pct(vg.acceptance)}), flagged valid=${vg.falseMisspelled}; INVALID→VALID ${vg.invalidAsValidCount}/${vg.invalid} (MISSPELLED ${vg.invalidFlagged}); medium-confidence records ${vg.confidenceMedium}`);
  for (const [k, b] of Object.entries(vg.byKind)) console.log(`    ${k.padEnd(18)} ${b.ok}/${b.n} meet the contract  ${JSON.stringify(b.verdicts)}`);
  if (vg.failures.length) console.log(`  GOLD FAILURES: ${vg.failures.join(" | ")}`);
  console.log(`G regression [REGRESSION]: ${r.regression.total - r.regression.failures.length}/${r.regression.total} hold${r.regression.failures.length ? " FAIL: " + r.regression.failures.join(" | ") : ""}`);
  const mu = r.mutation;
  console.log(`H mutation (seeded, ${mu.mutated} mutated forms): VALID ${mu.valid} (legit collisions/adjudicated ${mu.collisions}, SUSPECT ${mu.suspects}); MISSPELLED ${mu.misspelled} (wrong repairs ${mu.wrongRepairs}); UNKNOWN ${mu.unknown}`);
  console.log(`E perf: word p50/p95/p99 = ${ms(r.perf.wordP50Ms)}/${ms(r.perf.wordP95Ms)}/${ms(r.perf.wordP99Ms)} ms; 20k chars p50 ${ms(r.perf.doc20kCharsP50Ms)} ms (max ${ms(r.perf.doc20kCharsMaxMs)}); heap ${r.perf.heapUsedMb.toFixed(1)} MB`);
}

function main() {
  const seed = bundledEngine();
  const t0 = performance.now();
  const r = runBenchmark(seed);
  print("V1 (bundled SEED packs — production configuration)", r);
  const rb = runBenchmark(simulatedBroadEngine());
  print("V1 (same vocabulary declared BROAD — simulation: shows why SEED disables edit-distance detection)", rb);
  const legacy = runLegacyComparison();
  console.log("\n=== Legacy engine (same datasets) ===");
  console.log(`clean text FP: ${legacy.clean.falsePositives} (${legacy.clean.fpPer1000Words.toFixed(2)}/1000w) over ${legacy.clean.words} words`);
  console.log(`gold MISSPELLING top-1: ${legacy.goldMisspelling.ok}/${legacy.goldMisspelling.total}; VALID silent: ${legacy.goldValid.ok}/${legacy.goldValid.total}; LEGAL silent: ${legacy.goldLegal.ok}/${legacy.goldLegal.total}; UNKNOWN silent: ${legacy.goldUnknown.ok}/${legacy.goldUnknown.total}`);
  console.log(`\n(total ${(performance.now() - t0).toFixed(0)} ms)`);
  const i = process.argv.indexOf("--json");
  if (i !== -1 && process.argv[i + 1]) fs.writeFileSync(process.argv[i + 1]!, JSON.stringify({ v1: r, v1BroadSimulation: rb, legacy }, null, 2));
}
main();
