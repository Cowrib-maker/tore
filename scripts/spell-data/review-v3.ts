/**
 * Native-review operations for the Phase-3 gold candidate sets.
 *   npx tsx scripts/spell-data/review-v3.ts status
 *   npx tsx scripts/spell-data/review-v3.ts queue   [--set X] [--category C] [--limit 200] [--out queue.tsv]
 *   npx tsx scripts/spell-data/review-v3.ts corpus-queue [--limit 500] [--out .spell-research/review-queue/corpus.tsv]   (LOCAL ONLY: class-D context)
 *   npx tsx scripts/spell-data/review-v3.ts import --file filled.tsv --reviewer ID --kind NATIVE_HUMAN|ENGINEER_HUMAN|MODEL_ASSISTANT [--set X]
 *   npx tsx scripts/spell-data/review-v3.ts promote
 * `import` records the decisions (append-only) and re-files items by status. The reviewer KIND is YOUR claim: use NATIVE_HUMAN only for a real
 * native-speaker reviewer — gold needs two distinct ones.
 */
import fs from "node:fs";
import path from "node:path";
import { exportQueueTsv, importDecisionsTsv, itemState, reviewQueue, summarize, type ReviewCategory, type ReviewerKind, type SpellReviewItem } from "../../src/spell-engine/review/review";
import { DIRS, GOLD_ROOT, loadAll, promote } from "../../tests/evaluation/spell-v3/gold-sets";

const arg = (n: string, d = "") => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const cmd = process.argv[2];

function status() {
  const sets = loadAll();
  const all = sets.flatMap((s) => s.items);
  console.log(`gold candidate sets (dataset ${sets[0]?.datasetVersion ?? "-"}):`);
  for (const d of DIRS) {
    const items = sets.filter((s) => s.provenanceDir === d).flatMap((s) => s.items);
    console.log(`  ${d.padEnd(9)} ${String(items.length).padStart(5)} items in ${sets.filter((s) => s.provenanceDir === d).length} sets`);
  }
  const sum = summarize(all);
  console.log("by honest status:", JSON.stringify(sum));
  console.log(`NATIVE-REVIEWED gold items: ${sum.NATIVE_REVIEWED}${sum.NATIVE_REVIEWED === 0 ? "  ← nothing here may be called gold or native-reviewed" : ""}`);
  for (const s of sets) console.log(`  ${s.provenanceDir}/${s.set.padEnd(24)} ${String(s.items.length).padStart(5)} items`);
}

async function corpusQueue() {
  const { createSpellEngineV1 } = await import("../../src/spell-engine/bundled");
  const { lex } = await import("../../src/spell-engine/tokenizer/lexer");
  const { normalizeToken } = await import("../../src/spell-engine/tokenizer/normalize");
  const { eduge } = await import("./lib/corpus");
  const { REVIEW_SCHEMA } = await import("../../src/spell-engine/review/review");
  const limit = Number(arg("--limit", "500"));
  const engine = createSpellEngineV1();
  const seen = new Map<string, { n: number; sentence: string; verdict: string; reason?: string; suggestion?: string }>();
  for await (const d of eduge(40_000)) {
    if (d.id % 8 !== 3) continue;
    for (const sentence of d.text.split(/(?<=[.!?])\s+/u).slice(0, 6)) {
      if (sentence.length > 300) continue;
      for (const t of lex(sentence)) {
        if (t.kind !== "WORD") continue;
        const key = normalizeToken(t.text);
        const cur = seen.get(key);
        if (cur) cur.n += 1;
        else {
          const r = engine.analyze(sentence);
          const tok = r.tokens.find((x) => x.token.range.start === t.range.start);
          if (tok && tok.verdict !== "VALID") seen.set(key, { n: 1, sentence, verdict: tok.verdict, reason: tok.reasonCode, suggestion: r.issues.find((i) => i.range.start === t.range.start)?.suggestions[0]?.text });
        }
      }
    }
  }
  const items: SpellReviewItem[] = [...seen]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, limit)
    .map(([key, v], i) => ({
      schema: REVIEW_SCHEMA, id: `CORPUS_QUEUE:${String(i + 1).padStart(4, "0")}:${key}`, datasetVersion: "spell-queue-local", token: key, sentence: v.sentence, sentenceOrigin: "LOCAL_CORPUS_D" as const,
      category: (v.verdict === "MISSPELLED" ? "MISSPELLED" : "UNKNOWN") as ReviewCategory, currentVerdict: v.verdict as "UNKNOWN" | "MISSPELLED", currentSuggestion: v.suggestion, currentReason: v.reason,
      source: "local news corpus (class D) — LOCAL ONLY, never commit", provenance: "AUTOMATIC" as ReviewerKind, priority: v.n, decisions: [{ seq: 1, reviewerId: "engine", reviewerKind: "AUTOMATIC" as ReviewerKind, verdict: v.verdict as "UNKNOWN" | "MISSPELLED", at: new Date().toISOString() }],
    }));
  const out = path.resolve(arg("--out", ".spell-research/review-queue/corpus.tsv"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, exportQueueTsv(items, { includeLocalCorpusSentences: true }));
  fs.writeFileSync(out.replace(/\.tsv$/, ".json"), JSON.stringify({ schema: "tore-spell-review-queue/1", items }, null, 1));
  console.log(`wrote ${items.length} LOCAL queue items to ${path.relative(process.cwd(), out)} (class-D sentences: do not commit or share)`);
}

function main() {
  if (cmd === "status") return status();
  if (cmd === "queue") {
    const sets = loadAll().filter((s) => !arg("--set") || s.set === arg("--set"));
    const q = reviewQueue(sets.flatMap((s) => s.items), { category: (arg("--category") || undefined) as ReviewCategory | undefined, limit: Number(arg("--limit", "200")) });
    const tsv = exportQueueTsv(q);
    const out = arg("--out");
    if (out) fs.writeFileSync(out, tsv);
    console.log(out ? `wrote ${q.length} items to ${out}` : tsv);
    return;
  }
  if (cmd === "corpus-queue") return void corpusQueue();
  if (cmd === "import") {
    const file = arg("--file");
    const reviewer = arg("--reviewer");
    const kind = arg("--kind") as ReviewerKind;
    if (!file || !reviewer || !["NATIVE_HUMAN", "ENGINEER_HUMAN", "MODEL_ASSISTANT"].includes(kind)) throw new Error("import needs --file --reviewer --kind NATIVE_HUMAN|ENGINEER_HUMAN|MODEL_ASSISTANT");
    const tsv = fs.readFileSync(file, "utf8");
    let applied = 0;
    const skipped: string[] = [];
    for (const d of DIRS) {
      const dir = path.join(GOLD_ROOT, d);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        const sf = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (arg("--set") && sf.set !== arg("--set")) continue;
        const r = importDecisionsTsv(sf.items, tsv, { id: reviewer, kind }, new Date().toISOString());
        if (r.applied > 0) {
          sf.items = r.items;
          fs.writeFileSync(path.join(dir, f), JSON.stringify(sf, null, 1) + "\n");
        }
        applied += r.applied;
        skipped.push(...r.skipped.filter((s) => !s.reason.startsWith("unknown id")).map((s) => `${f}:${s.line} ${s.reason}`));
      }
    }
    const { moved } = promote();
    console.log(`applied ${applied} decisions as ${kind} «${reviewer}»; ${moved} items re-filed by status; skipped: ${skipped.length}`);
    skipped.slice(0, 10).forEach((s) => console.log("  " + s));
    return;
  }
  if (cmd === "promote") return console.log(`re-filed ${promote().moved} items`);
  console.log("usage: status | queue | corpus-queue | import | promote");
  void itemState;
}
main();
