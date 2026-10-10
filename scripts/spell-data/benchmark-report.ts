/**
 * One honest benchmark report. Every number comes from a stored baseline or a live count; a metric that cannot be measured honestly prints
 * NOT MEASURED instead of an estimate. Native-reviewed, engineer-reviewed, model-adjudicated and automatic data are never mixed.
 *   npx tsx scripts/spell-data/benchmark-report.ts
 */
import fs from "node:fs";
import path from "node:path";
import { BUNDLED_PACKS } from "../../src/spell-engine/bundled";
import { SPELL_ENGINE_VERSION, SPELL_MORPHOLOGY_VERSION, SPELL_RULES_VERSION } from "../../src/spell-engine/core/versions";
import { tierOf } from "../../src/spell-engine/lexicon/pack-schema";
import { goldStats, summarize } from "../../src/spell-engine/review/review";
import { loadAll } from "../../tests/evaluation/spell-v3/gold-sets";

const B = path.resolve(__dirname, "../../tests/evaluation/spell-v3/baselines");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(B, f), "utf8"));
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(2)}%` : "NOT MEASURED");
const NM = "NOT MEASURED";

const hold = read("phase3-final-holdout.json");
const cur = hold.result.PHASE_3_CURRENT.ALL;
const claim = hold.result["RELEASE_CLAIM(TRUSTED+REVIEWED)"].ALL;
const syn = read("phase6-synthetic-precision.json");
const conf = syn.runs.reduce((s: number, r: { confident: number }) => s + r.confident, 0);
const right = syn.runs.reduce((s: number, r: { confidentRight: number }) => s + r.confidentRight, 0);

const entriesByTier: Record<string, number> = {};
for (const p of BUNDLED_PACKS) entriesByTier[tierOf(p)] = (entriesByTier[tierOf(p)] ?? 0) + p.entries.length;
const items = loadAll().flatMap((s) => s.items);
const gs = goldStats(items);
const sum = summarize(items);

const L = [
  "# TORE Spell benchmark report",
  "",
  `engine ${SPELL_ENGINE_VERSION} · rules ${SPELL_RULES_VERSION} · morphology ${SPELL_MORPHOLOGY_VERSION} · gold dataset ${items[0]?.datasetVersion ?? "none"} · holdout baseline ${hold.date.slice(0, 10)} (frozen; ${hold.documents} documents, ${hold.words} word tokens)`,
  `lexicon entries by tier: ${Object.entries(entriesByTier).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
  "",
  "| metric | value | basis |",
  "|---|---|---|",
  `| VALID, product configuration (all tiers) | ${pct(cur.valid, cur.words)} | frozen holdout; includes PROVISIONAL (AI-drafted) vocabulary |`,
  `| VALID, release-claim configuration (TRUSTED + REVIEWED only) | ${pct(claim.valid, claim.words)} | frozen holdout; the only figure that may back a release-quality claim |`,
  `| UNKNOWN | ${pct(cur.unknown, cur.words)} | frozen holdout |`,
  `| MISSPELLED tokens | ${cur.misspelled} (${pct(cur.misspelled, cur.words)}) | frozen holdout |`,
  `| flagged words the independent dictionary accepts (FP candidates) | ${cur.fpCandidates} | frozen holdout; second opinion is NOT native truth |`,
  `| false-positive rate against native truth | ${NM} | requires native-reviewed gold (${gs.nativeReviewed} items) |`,
  `| confident-suggestion precision | ${pct(right, conf)} (${right}/${conf}) | AUTO synthetic mutations, seeds ${syn.runs.map((r: { seed: number }) => r.seed).join(", ")}; not native-reviewed |`,
  `| synthetic typo detection / top-1 / top-3 / MRR | ${syn.runs.map((r: { detectedPct: number; top1PctOfAll: number; top3PctOfAll: number; mrr: number }) => `${r.detectedPct}% / ${r.top1PctOfAll}% / ${r.top3PctOfAll}% / ${r.mrr}`).join(" ; ")} | AUTO synthetic, per seed |`,
  `| misspelling recall on REAL typos | ${NM} | no real-typo ground truth exists |`,
  `| morphology accuracy | ${NM} | requires native-reviewed paradigm forms (${gs.reviewedForms.valid + gs.reviewedForms.invalid} reviewed forms) |`,
  `| protected-token accuracy | enforced by tests (spell-phase3-gates, spell-phase4: 0 protected tokens flagged) | not recomputed here |`,
  `| proper-name / loanword false accusations | 0 on assistant-authored sets (PENDING_NATIVE_REVIEW) | tests/evaluation/spell-v1 sets; not native gold |`,
  `| domain-specific (legal / government) correctness | ${NM} | no lawful domain corpus; genre rows are news proxies |`,
  `| latency / memory | see perf-v3.ts and doc-scale-perf.ts (run them; not stored here) | machine dependent |`,
  "",
  "## Review data by honest status (never merged)",
  "",
  `NATIVE_REVIEWED ${sum.NATIVE_REVIEWED} · NATIVE_PENDING ${sum.NATIVE_PENDING} · FLAGGED ${sum.FLAGGED} · DISPUTED ${sum.DISPUTED} · ENGINEER_REVIEWED ${sum.ENGINEER_REVIEWED} · MODEL_ADJUDICATED ${sum.MODEL_ADJUDICATED} · AUTO_GENERATED ${sum.AUTO_GENERATED} · UNREVIEWED ${sum.UNREVIEWED} (total ${sum.total})`,
  `native-review count ${gs.nativeReviewed} · reviewer agreement rate ${gs.agreementRate === null ? NM : pct(gs.agreementRate, 1)} · disputed ${gs.disputed} · adjudicated ${gs.adjudicated} · resolution rate ${gs.resolutionRate === null ? NM : pct(gs.resolutionRate, 1)} · reviewed forms valid/invalid ${gs.reviewedForms.valid}/${gs.reviewedForms.invalid} · pending forms ${gs.pendingForms}`,
  "",
  "Splits: development slice = documents ≤ 40,000 (every 4th) — used to plan work; frozen holdout = documents > 70,000 — aggregates only, never used to guide work; native-reviewed gold = 0 items; a fresh validation slice can only be cut once real native data exists and was not used for tuning.",
  "",
];
console.log(L.join("\n"));
