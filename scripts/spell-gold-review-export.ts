/**
 * Export the TORE morphology gold as a TSV a native linguist can review in a spreadsheet.
 *
 *   npx tsx scripts/spell-gold-review-export.ts [--out review.tsv] [--medium-only] [--disagreements-only]
 *
 * One row per surface form:
 *   id | dataset | lemma | surface | expected | scope | morphology | stem class | harmony | lexicon flags |
 *   engine verdict | engine reason | engine suggestion | contract met | author confidence |
 *   review status | note | REVIEWER DECISION | REVIEWER NOTE
 * The last two columns are intentionally empty: they are for the human. Nothing in this repo may be
 * relabelled NATIVE_REVIEWED until a named person has filled them in and the file records reviewer + date.
 */
import fs from "node:fs";
import { engineForRecord, loadNativeReviewed, loadVerbGoldDraft, satisfies } from "../tests/evaluation/spell-v1/gold-loader";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
const mediumOnly = args.includes("--medium-only");
const disagreementsOnly = args.includes("--disagreements-only");

const header = [
  "id", "dataset", "lemma", "surface", "expected", "scope", "morphology", "stem_class", "harmony", "lexicon_flags",
  "engine_verdict", "engine_reason", "engine_suggestion", "contract_met", "author_confidence", "review_status", "note",
  "REVIEWER_DECISION (ACCEPT/REJECT/CHANGE)", "REVIEWER_NOTE",
];
const esc = (s: string) => s.replace(/[\t\r\n]+/g, " ");
const rows: string[] = [header.join("\t")];
const engines = new Map<string, ReturnType<typeof engineForRecord>>();
let disagreements = 0;
for (const file of [loadVerbGoldDraft(), loadNativeReviewed()]) {
  for (const r of file.records) {
    if (mediumOnly && r.confidence !== "MEDIUM") continue;
    const key = `${r.lemma}|${r.flags.join(",")}`;
    let e = engines.get(key);
    if (!e) engines.set(key, (e = engineForRecord(r)));
    const res = e.checkWord(r.surface);
    const met = satisfies(r.expected, res.verdict);
    if (!met) disagreements += 1;
    if (disagreementsOnly && met) continue;
    rows.push(
      [
        r.id, r.dataset, r.lemma, r.surface, r.expected, r.scope,
        `${r.tags.join("+")} ${r.suffixChain.join(" ")}`.trim(), r.stemClass, r.harmony, r.flags.join(","),
        res.verdict, res.reasonCode, res.issue?.suggestions[0]?.text ?? "", met ? "yes" : "NO", r.confidence, r.reviewStatus,
        r.reason ?? "", "", "",
      ]
        .map((c) => esc(String(c)))
        .join("\t"),
    );
  }
}
const text = rows.join("\n") + "\n";
if (out) {
  fs.writeFileSync(out, text);
  console.error(`wrote ${rows.length - 1} rows to ${out} (${disagreements} engine/gold disagreements)`);
} else process.stdout.write(text);
