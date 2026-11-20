/**
 *   npx tsx scripts/spell-data/eval-names-loans.ts
 * Proper-name and loanword evaluation (assistant-authored sets, PENDING_NATIVE_REVIEW). Prints false-accusation and
 * recognition rates for the shipping engine. Not gold: it measures «do we wrongly accuse names/loans», not spelling accuracy.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { evaluateLoans, evaluateNames } from "../../tests/evaluation/spell-v1/eval-sets";

const e = createSpellEngineV1();
const n = evaluateNames(e);
const l = evaluateLoans(e);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(`PROPER NAMES  forms ${n.forms}: VALID ${pct(n.recognitionRate)} · UNKNOWN ${pct(n.unknown / n.forms)} · MISSPELLED (false accusation) ${n.misspelled} (${pct(n.falseAccusationRate)})`);
for (const [k, v] of Object.entries(n.byKind)) console.log(`   ${k.padEnd(7)} forms ${v.forms} recognised ${pct(v.valid / v.forms)} accused ${v.accused}`);
if (n.accused.length) console.log(`   accused: ${n.accused.join(" ")}`);
console.log(`LOANWORDS     forms ${l.forms}: VALID ${pct(l.recognitionRate)} · UNKNOWN ${pct(l.unknown / l.forms)} · MISSPELLED (false accusation) ${l.misspelled} (${pct(l.falseAccusationRate)})`);
if (l.accused.length) console.log(`   accused: ${l.accused.join(" ")}`);
console.log(`   non-standard spellings ${l.nonStandard}: detected ${l.nsDetected}, top-1 right ${l.nsTop1}, accepted as VALID ${l.nsAcceptedAsValid}`);
