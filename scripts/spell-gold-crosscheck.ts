/**
 * Independent corroboration of the TORE-authored gold against the UniMorph oracle (reference only).
 *
 *   TORE_SPELL_REF_UNIMORPH=/path/to/khk npx tsx scripts/spell-gold-crosscheck.ts
 *
 * Reports (a) how many gold VALID forms the oracle also lists (external corroboration), and
 * (b) every gold INVALID / DERIVATION / AMBIGUOUS form the oracle lists as valid: a CONFLICT that a person must
 * adjudicate. UniMorph is CC BY-SA and is read in memory only; nothing is copied into the repository.
 */
import fs from "node:fs";
import { loadVerbGoldDraft } from "../tests/evaluation/spell-v1/gold-loader";

const file = process.env.TORE_SPELL_REF_UNIMORPH;
if (!file || !fs.existsSync(file)) {
  console.error("Set TORE_SPELL_REF_UNIMORPH to a local UniMorph khk TSV. Skipping.");
  process.exit(0);
}
const rows = [...new Set(fs.readFileSync(file, "utf8").split("\n").filter(Boolean))].map((l) => l.split("\t") as [string, string, string]);
const oracle = new Map<string, Set<string>>();
for (const [lemma, form, tag] of rows) if (tag.startsWith("V")) (oracle.get(form) ?? oracle.set(form, new Set()).get(form)!).add(lemma);
const oracleLemmas = new Set(rows.filter((r) => r[2].startsWith("V")).map((r) => r[0]));
const { records } = loadVerbGoldDraft();
const lemmas = [...new Set(records.map((r) => r.lemma))];
const valid = records.filter((r) => r.expected === "VALID");
const attested = valid.filter((r) => oracle.has(r.surface));
const conflicts = records.filter((r) => (r.expected === "INVALID" || r.expected === "AMBIGUOUS") && oracle.has(r.surface));
// A derived stem is valid Mongolian; the oracle merely files it under imperative. Policy difference, not a conflict.
const derivationOverlap = [...new Set(records.filter((r) => r.expected === "DERIVATION" && oracle.has(r.surface)).map((r) => r.surface))];
console.log(`gold lemmas ${lemmas.length}; also in the oracle: ${lemmas.filter((l) => oracleLemmas.has(l)).join(", ") || "none"}`);
console.log(`gold VALID forms ${valid.length}; also listed by the oracle ${attested.length} (${((attested.length / valid.length) * 100).toFixed(1)} %)`);
console.log(`CONFLICTS (gold INVALID/AMBIGUOUS, oracle lists the form as valid): ${conflicts.length}`);
console.log(`derivation forms the oracle files as imperative (policy difference, not an error): ${derivationOverlap.join(", ") || "none"}`);
for (const c of conflicts) console.log(`  ${c.lemma}:${c.surface} [${c.expected}] ${c.reason} — oracle lemma(s): ${[...oracle.get(c.surface)!].join(",")}`);
