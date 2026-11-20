/**
 * Human-review workflow.
 *   export:  npx tsx scripts/spell-data/review.ts export --kind flags|unknown|valid --n 200 [--research]
 *   import:  npx tsx scripts/spell-data/review.ts import
 *
 * export writes .spell-research/review/batch-<kind>.tsv (the items, with context, engine verdict, suggestions, source, frequency
 * and morphology) and one blank sheet per reviewer id in .spell-research/review/sheets/. A reviewer fills
 * `verdict` (VALID | MISSPELLED | UNKNOWN), `best` (best suggestion) and `notes`, and keeps the `# reviewer=<id> kind=<kind>` header
 * (kind: HUMAN_NATIVE | HUMAN_OTHER | AI_ASSISTANT). import reads every sheet in sheets/, applies the consensus rules
 * (lib/review-core.ts) and writes tests/evaluation/spell-v1/gold/reviewed-v1.json + .spell-research/review/summary.json.
 * AI sheets never become gold; one human is PENDING; two disagreeing humans are DISPUTED and listed.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable } from "./lib/hunspell-provider";
import { buildGold, consensus, type ReviewItem, type ReviewRow, type ReviewerKind, type ReviewVerdict } from "./lib/review-core";

const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, ".spell-research/review");
const GOLD = path.join(ROOT, "tests/evaluation/spell-v1/gold/reviewed-v1.json");
const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const esc = (s: string) => s.replace(/[\t\r\n]+/g, " ");

async function exportBatch() {
  if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
  const kind = arg("--kind", "flags");
  const n = Number(arg("--n", "200"));
  const engine = createSpellEngineV1();
  const freq = loadFrequencyTable(FREQ_FILE);
  const rows: { item: ReviewItem; verdict: string; suggestions: string; freq: number; morph: string }[] = [];
  const seen = new Set<string>();
  let docNo = 0;
  for await (const d of eduge(6000)) {
    docNo += 1;
    if (docNo % 3 !== 0) continue;
    const text = d.text;
    const toks = lex(text);
    for (const t of toks) {
      if (t.kind !== "WORD") continue;
      const key = normalizeToken(t.text);
      if (seen.has(key)) continue;
      const r = engine.analyze(text.slice(Math.max(0, t.range.start - 60), t.range.end + 60), { reportUnknown: true });
      const a = r.tokens.find((x) => normalizeToken(x.token.text) === key);
      if (!a) continue;
      const want = kind === "flags" ? a.verdict === "MISSPELLED" : kind === "unknown" ? a.verdict === "UNKNOWN" && (freq?.pm(key) ?? 0) > 5 : a.verdict === "VALID" && seen.size % 50 === 0;
      if (!want) continue;
      seen.add(key);
      const iss = r.issues.find((i) => normalizeToken(i.token) === key);
      rows.push({
        item: { id: `${kind}-${rows.length + 1}`, token: t.text, context: text.slice(Math.max(0, t.range.start - 40), t.range.start) + "⟦" + t.text + "⟧" + text.slice(t.range.end, t.range.end + 40), source: "local news corpus (class D)", reason: a.reasonCode },
        verdict: a.verdict,
        suggestions: iss?.suggestions.map((s) => s.text).join("|") ?? "",
        freq: freq ? Math.round(freq.pm(key) * 100) / 100 : 0,
        morph: a.lemma ? `lemma=${a.lemma}` : "",
      });
      if (rows.length >= n) break;
    }
    if (rows.length >= n) break;
  }
  fs.mkdirSync(path.join(DIR, "sheets"), { recursive: true });
  const header = "id\ttoken\tcontext\tengineVerdict\tsuggestions\tsource\tperMillion\tmorphology\treason";
  fs.writeFileSync(path.join(DIR, `batch-${kind}.tsv`), [header, ...rows.map((r) => [r.item.id, r.item.token, esc(r.item.context), r.verdict, r.suggestions, r.item.source, r.freq, r.morph, r.item.reason].join("\t"))].join("\n"));
  fs.writeFileSync(path.join(DIR, `batch-${kind}.items.json`), JSON.stringify(rows.map((r) => r.item), null, 1));
  for (const who of ["reviewerA", "reviewerB"]) {
    fs.writeFileSync(path.join(DIR, "sheets", `${kind}-${who}.tsv`), [`# reviewer=${who} kind=HUMAN_NATIVE   <- EDIT these two fields to your id and kind`, "id\ttoken\tcontext\tverdict\tbest\tnotes", ...rows.map((r) => [r.item.id, r.item.token, esc(r.item.context), "", "", ""].join("\t"))].join("\n"));
  }
  console.log(`exported ${rows.length} ${kind} items → .spell-research/review/batch-${kind}.tsv; blank sheets for reviewerA/reviewerB in sheets/ (give each real reviewer their own copy)`);
}

function importSheets() {
  const sheetsDir = path.join(DIR, "sheets");
  if (!fs.existsSync(sheetsDir)) throw new Error("no sheets: run export first");
  const items: ReviewItem[] = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".items.json"))) items.push(...(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as ReviewItem[]));
  const rows: ReviewRow[] = [];
  const reviewers = new Set<string>();
  for (const f of fs.readdirSync(sheetsDir).filter((x) => x.endsWith(".tsv"))) {
    const lines = fs.readFileSync(path.join(sheetsDir, f), "utf8").split("\n");
    const meta = /# reviewer=(\S+) kind=(HUMAN_NATIVE|HUMAN_OTHER|AI_ASSISTANT)/.exec(lines[0] ?? "");
    if (!meta) throw new Error(`${f}: missing «# reviewer=<id> kind=<kind>» header`);
    reviewers.add(`${meta[1]}:${meta[2]}`);
    for (const line of lines.slice(2)) {
      const [id, , , verdict, best, notes] = line.split("\t");
      if (!id || !verdict) continue;
      if (!["VALID", "MISSPELLED", "UNKNOWN"].includes(verdict)) throw new Error(`${f}: bad verdict «${verdict}» for ${id}`);
      rows.push({ id, reviewer: meta[1]!, reviewerKind: meta[2] as ReviewerKind, verdict: verdict as ReviewVerdict, best: best || undefined, notes: notes || undefined, date: fs.statSync(path.join(sheetsDir, f)).mtime.toISOString().slice(0, 10) });
    }
  }
  const byId = new Map<string, ReviewRow[]>();
  for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
  const cons = items.map((i) => consensus(i.id, byId.get(i.id) ?? []));
  const gold = buildGold(items, cons, new Date().toISOString().slice(0, 10));
  const counts = cons.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {});
  fs.mkdirSync(path.dirname(GOLD), { recursive: true });
  fs.writeFileSync(GOLD, JSON.stringify({ schema: "tore-spell-reviewed-gold/1", note: "Only items two human reviewers agreed on. NATIVE_REVIEWED needs two distinct native reviewers. AI judgments and single-reviewer items are never included.", reviewers: [...reviewers], counts, disputed: gold.disputed, valid: gold.valid, invalid: gold.invalid, unknown: gold.unknown, suggestions: gold.suggestions }, null, 1));
  fs.writeFileSync(path.join(DIR, "summary.json"), JSON.stringify({ counts, excluded: gold.excluded, disputed: gold.disputed }, null, 1));
  console.log(`imported ${rows.length} reviewer rows for ${items.length} items → ${JSON.stringify(counts)}; gold: valid ${gold.valid.length}, invalid ${gold.invalid.length}, unknown ${gold.unknown.length}, with-suggestion ${gold.suggestions.length}; DISPUTED ${gold.disputed.length} (kept out of gold)`);
}

const cmd = process.argv[2];
if (cmd === "export") void exportBatch();
else if (cmd === "import") importSheets();
else console.log("usage: review.ts export --kind flags|unknown|valid --n 200 | import");
