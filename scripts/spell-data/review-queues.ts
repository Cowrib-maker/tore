/**
 * Build the deterministic, impact-scored native-review queues (A–L) from the DEVELOPMENT slice.
 *   npx tsx scripts/spell-data/review-queues.ts [--limit 1000] [--out .spell-research/review-queue/queues]
 * Dev slice = documents ≤ 40,000, every 4th (the frozen holdout is never read here). Output files contain words and counts only — no corpus text —
 * but because the source corpus has NO stated licence (see sources.ts: tugstugi-datasets) they are LOCAL ONLY: written under .spell-research/,
 * never committed. The aggregate numbers printed here are what reports may quote; every «max coverage» figure is an UPPER-BOUND ESTIMATE.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { SPELL_ENGINE_VERSION } from "../../src/spell-engine/core/versions";
import { exportQueueTsv } from "../../src/spell-engine/review/review";
import { QUEUE_IDS, buildQueues, maxCoverageGain, queueToReviewItems, type Candidate, type Contradiction, type MorphLemma, type QueueId } from "../../src/spell-engine/review/queue";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { loadAll } from "../../tests/evaluation/spell-v3/gold-sets";
import { eduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable, loadHunspellResearchProvider } from "./lib/hunspell-provider";
import { buildClassifier } from "./lib/taxonomy-lib";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const PROFESSIONAL = new Set(["хууль", "улс төр", "эдийн засаг"]); // legal / government / business news labels

async function main() {
  const limit = Number(arg("--limit", "1000"));
  const outDir = path.resolve(arg("--out", ".spell-research/review-queue/queues"));
  const freq = loadFrequencyTable(FREQ_FILE);
  const hs = await loadHunspellResearchProvider(freq);
  const eng = createSpellEngineV1();

  type Rec = { key: string; n: number; docs: number; prof: number; titleOnly: boolean; upperOnly: boolean; sample: string };
  const types = new Map<string, Rec>();
  let tokens = 0;
  for await (const d of eduge(40_000, 0)) {
    if (d.id % 4 !== 1) continue;
    const professional = PROFESSIONAL.has(d.label);
    const seen = new Set<string>();
    for (const t of lex(d.text)) {
      if (t.kind !== "WORD") continue;
      tokens += 1;
      const key = normalizeToken(t.text);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      let r = types.get(key);
      if (!r) types.set(key, (r = { key, n: 0, docs: 0, prof: 0, titleOnly: true, upperOnly: false, sample: t.text }));
      r.n += 1;
      r.titleOnly = r.titleOnly && title;
      if (professional) r.prof += 1;
      if (!seen.has(key)) (seen.add(key), (r.docs += 1));
    }
  }

  // approximate fan-out: types sharing the first five letters (stem start)
  const stemCount = new Map<string, number>();
  for (const r of types.values()) if (r.key.length >= 5) stemCount.set(r.key.slice(0, 5), (stemCount.get(r.key.slice(0, 5)) ?? 0) + 1);
  const fan = (k: string) => (k.length >= 5 ? Math.min(50, (stemCount.get(k.slice(0, 5)) ?? 1) - 1) : 0);

  const classify = buildClassifier(eng, hs, freq);
  const candidates: Candidate[] = [];
  const contradictions: Contradiction[] = [];
  const lemmaForms = new Map<string, MorphLemma>();
  for (const r of types.values()) {
    const a = eng.analyze(`и ${r.titleOnly ? r.sample : r.key}`).tokens[1]!;
    const opinion = hs.accepts(r.key) ? "ACCEPTS" : "REJECTS";
    if (a.verdict === "VALID") {
      if (a.reasonCode === "MORPHOLOGY") {
        if (opinion === "REJECTS" && r.n >= 3) contradictions.push({ token: r.key, occurrences: r.n, documents: r.docs, engineSays: "VALID", secondOpinion: "REJECTS", lemma: a.lemma });
        if (a.lemma && r.n >= 1) {
          const m = lemmaForms.get(a.lemma) ?? { lemma: a.lemma, pos: eng.lexicon.lookup(a.lemma)[0]?.pos ?? "X", forms: [] };
          m.forms.push({ form: r.key, occurrences: r.n, engineSays: "VALID" });
          lemmaForms.set(a.lemma, m);
        }
      }
      continue;
    }
    const cat = a.verdict === "UNKNOWN" ? classify({ key: r.key, n: r.n, titleOnly: r.titleOnly, upperOnly: r.upperOnly, sample: r.sample }).cat : "TRUE_UNKNOWN";
    candidates.push({ token: r.key, occurrences: r.n, documents: r.docs, category: cat, engineVerdict: a.verdict, engineReason: a.reasonCode, fanOut: fan(r.key), professionalShare: r.n ? r.prof / r.n : 0, secondOpinion: opinion });
  }
  const morphLemmas = [...lemmaForms.values()].filter((m) => m.forms.length >= 3).sort((x, y) => (x.lemma < y.lemma ? -1 : 1));
  const gold = loadAll().flatMap((s) => s.items);
  const input = { candidates: candidates.sort((x, y) => (x.token < y.token ? -1 : 1)), contradictions: contradictions.sort((x, y) => (x.token < y.token ? -1 : 1)), morphLemmas, gold };

  const queues = buildQueues(input, { limit });
  const again = buildQueues(input, { limit });
  const hash = crypto.createHash("sha256").update(JSON.stringify(queues)).digest("hex").slice(0, 16);
  if (JSON.stringify(again) !== JSON.stringify(queues)) throw new Error("queue generation is not deterministic");

  fs.mkdirSync(outDir, { recursive: true });
  const at = "2026-01-01T00:00:00Z"; // fixed: the sheet must be reproducible byte for byte
  for (const q of QUEUE_IDS) {
    const items = queueToReviewItems(queues[q], { engineVersion: SPELL_ENGINE_VERSION, at });
    fs.writeFileSync(path.join(outDir, `${q}.tsv`), exportQueueTsv(items));
    fs.writeFileSync(path.join(outDir, `${q}.json`), JSON.stringify({ schema: "tore-spell-review-queue/1", queue: q, items }, null, 1));
  }

  console.log(`dev slice: ${tokens} word tokens, ${types.size} types; engine ${SPELL_ENGINE_VERSION}; queue hash ${hash} (limit ${limit})`);
  console.log("queue                         items  sum-occurrences");
  for (const q of QUEUE_IDS) console.log(`${q.padEnd(28)} ${String(queues[q].length).padStart(6)}  ${String(queues[q].reduce((s, x) => s + x.occurrences, 0)).padStart(8)}`);
  const full = buildQueues(input, {});
  for (const q of ["HIGH_IMPACT_MISSING_LEMMAS", "HIGH_FREQUENCY_UNKNOWN"] as QueueId[]) {
    const all = full[q];
    const row = [100, 500, 1000].map((k) => {
      const top = all.slice(0, k);
      const docs = top.reduce((s, x) => s + x.documents, 0);
      const fo = top.reduce((s, x) => s + (candidates.find((c) => c.token === x.token)?.fanOut ?? 0), 0);
      return `top ${k}: ≤ +${maxCoverageGain(all, k, tokens).toFixed(2)} pp (ESTIMATE, upper bound); ${top.reduce((s, x) => s + x.occurrences, 0)} tokens; Σ document counts ${docs}; Σ observed related forms ${fo}`;
    });
    console.log(`\n${q} (${all.length} items in total)\n  ${row.join("\n  ")}`);
  }
  console.log(`\nwrote ${QUEUE_IDS.length} queues to ${path.relative(process.cwd(), outDir)} (LOCAL ONLY, not committed)`);
  hs.dispose();
}
void main();
