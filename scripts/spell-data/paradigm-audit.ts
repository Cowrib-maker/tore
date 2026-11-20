/**
 * Audits the engine against NATIVE-REVIEWED paradigm forms (forms ≥2 distinct natives judged the same way on a NATIVE_REVIEWED lemma).
 *   npx tsx scripts/spell-data/paradigm-audit.ts
 * Exit code 1 when the engine accepts a form natives call invalid (falseAccept) or accuses a form natives call valid (falseReject).
 * Coverage gaps (natives: valid, engine: UNKNOWN) are reported but are not failures: they are missing knowledge, not wrong answers.
 * With no native review this prints that nothing can be audited — it never substitutes model or engineer judgments.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { paradigmAudit, paradigmGold } from "../../src/spell-engine/review/paradigm-audit";
import { loadAll } from "../../tests/evaluation/spell-v3/gold-sets";

const items = loadAll().flatMap((s) => s.items);
const gold = paradigmGold(items);
if (gold.length === 0) {
  console.log("NATIVE-REVIEWED paradigm forms: 0 — nothing to audit. Engineer/model judgments are not substituted.");
  process.exit(0);
}
const engine = createSpellEngineV1();
const verdictOf = (form: string) => engine.analyze(`Энэ ${form} нь`).tokens[1]!.verdict;
const r = paradigmAudit(gold, verdictOf);
const show = (name: string, xs: typeof r.falseAccept) => xs.length && console.log(`${name} (${xs.length}): ${xs.slice(0, 20).map((g) => `${g.lemma}→${g.form}`).join(" ")}`);
console.log(`native-reviewed paradigm forms: ${r.forms}; engine agrees on ${r.agree} (${((100 * r.agree) / r.forms).toFixed(1)}%)`);
show("FALSE ACCEPT (natives: invalid, engine: VALID)", r.falseAccept);
show("FALSE REJECT (natives: valid, engine: MISSPELLED)", r.falseReject);
show("coverage gap (natives: valid, engine: UNKNOWN)", r.coverageGap);
process.exit(r.falseAccept.length + r.falseReject.length > 0 ? 1 : 0);
