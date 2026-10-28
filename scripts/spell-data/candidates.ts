/**
 * Stage — candidate-lexicon: words a source attests that the engine does not know, with FULL provenance per item.
 *   npx tsx scripts/spell-data/candidates.ts --source tugstugi-datasets|tore-ui [--min 3] [--limit 20000]
 *
 * Output: .spell-research/out/candidates-<source>.tsv with
 *   word, normalizedWord, sourceIds, sourceClass, frequency, firstDoc, lastDoc, ingestedAt, licenseStatus, confidence,
 *   reviewStatus, reviewer, notes
 * Frequency is evidence, never proof: confidence is LOW unless the word is also attested lower-case in ≥3 documents and
 * is not name-like. licenseStatus comes from the source registry; a candidate from a source that is not
 * VERIFIED_SHIPPABLE can inform human review but can NEVER be promoted into a release pack (the build only reads
 * sources/*.tsv and checks every pack's sourceIds against the registry).
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { eduge, hasEduge } from "./lib/corpus";
import { sourceById } from "./sources";

const ROOT = path.resolve(__dirname, "../..");
const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);

type Stat = { n: number; lower: number; docs: Set<number>; first: number; last: number; sample: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function main() {
  const sourceId = arg("--source", "tugstugi-datasets");
  const min = Number(arg("--min", "3"));
  const limit = Number(arg("--limit", "20000"));
  const src = sourceById(sourceId === "tore-ui" ? "tore-ui-corpus-forms" : sourceId);
  if (!src) throw new Error(`unknown source ${sourceId}`);
  const engine = createSpellEngineV1();
  const stats = new Map<string, Stat>();
  const add = (w: string, docId: number, lower: boolean) => {
    const k = normalizeToken(w);
    const s = stats.get(k) ?? { n: 0, lower: 0, docs: new Set<number>(), first: docId, last: docId, sample: w };
    s.n += 1;
    if (lower) s.lower += 1;
    s.docs.add(docId);
    s.last = docId;
    stats.set(k, s);
  };
  if (sourceId === "tore-ui") {
    walk(path.join(ROOT, "src")).filter((f) => !/spell-engine|generated|\.test\./.test(f)).forEach((f, i) => {
      const text = fs.readFileSync(f, "utf8");
      if (/[Ѐ-ӿ]/u.test(text)) for (const t of lex(text)) if (t.kind === "WORD") add(t.text, i, t.caseShape === "LOWER");
    });
  } else {
    if (!hasEduge()) throw new Error("corpus missing: pipeline fetch");
    for await (const d of eduge(Infinity)) for (const t of lex(d.text)) if (t.kind === "WORD") add(t.text, d.id, t.caseShape === "LOWER");
  }
  const when = new Date().toISOString();
  const rows: string[] = [];
  const cands = [...stats]
    .filter(([k, s]) => s.n >= min && k.length >= 3 && /^[а-яёөү]+$/u.test(k) && engine.checkWord(k).verdict !== "VALID")
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, limit);
  for (const [k, s] of cands) {
    const confidence = s.lower >= 3 && s.docs.size >= 3 && s.lower / s.n > 0.7 ? "MEDIUM" : "LOW";
    rows.push([s.sample, k, `[${src.sourceId}]`, src.dataClass, s.n, s.first, s.last, when, src.status, confidence, "PENDING", "", s.lower / s.n < 0.3 ? "mostly capitalised: likely a name" : ""].join("\t"));
  }
  const out = path.join(ROOT, `.spell-research/out/candidates-${sourceId}.tsv`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, ["word\tnormalizedWord\tsourceIds\tsourceClass\tfrequency\tfirstDoc\tlastDoc\tingestedAt\tlicenseStatus\tconfidence\treviewStatus\treviewer\tnotes", ...rows].join("\n"));
  console.log(`${rows.length} candidates from ${sourceId} (${src.status}${src.status !== "VERIFIED_SHIPPABLE" ? " — review input only, cannot ship" : ""}) → ${path.relative(ROOT, out)}`);
}
void main();
