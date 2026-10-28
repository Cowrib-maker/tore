/**
 * Engine vs the Phase-3 gold CANDIDATE sets (per set). The reference is the ASSISTANT's judgment (MODEL_ADJUDICATED), so «agreement» measures
 * consistency with that judgment, NOT accuracy: native review decides who is right wherever they disagree (those items are the review queue's top).
 *   npx tsx scripts/spell-data/gold-report.ts [--tier trusted]
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { itemState } from "../../src/spell-engine/review/review";
import { loadAll, locate } from "../../tests/evaluation/spell-v3/gold-sets";

const tier = process.argv.includes("--tier") ? "TRUSTED" : "PROVISIONAL";
const engine = createSpellEngineV1({ minTier: tier });
const sets = loadAll().filter((s) => s.set !== "P_LEMMAS_PROVISIONAL");
console.log(`engine tier floor: ${tier}   (sets A–O, reference = assistant judgment, NOT native)`);
console.log(`${"set".padEnd(24)}${"items".padStart(6)}${"agree".padStart(8)}${"engVALID".padStart(9)}${"engUNK".padStart(8)}${"engMISS".padStart(8)}${"falseAcc".padStart(9)}${"top1ok".padStart(8)}`);
let T = { n: 0, agree: 0, fa: 0 };
for (const s of sets) {
  let agree = 0, v = 0, u = 0, m = 0, fa = 0, sugOk = 0, sugN = 0;
  const disagree: string[] = [];
  for (const it of s.items) {
    const exp = itemState(it).verdict ?? it.decisions[0]!.verdict;
    const sentence = it.sentence ?? `Энэ ${it.token} нь`;
    const r = engine.analyze(sentence);
    const start = locate(sentence, it.token);
    const tok = r.tokens.find((x) => x.token.range.start === start);
    const got = (tok?.verdict ?? "UNKNOWN") as "VALID" | "UNKNOWN" | "MISSPELLED";
    if (got === "VALID") v += 1; else if (got === "UNKNOWN") u += 1; else m += 1;
    if (got === exp) agree += 1; else if (disagree.length < 6) disagree.push(`${it.token}:${exp}→${got}`);
    if (got === "MISSPELLED" && exp !== "MISSPELLED") fa += 1;
    if (exp === "MISSPELLED" && got === "MISSPELLED") { sugN += 1; if (r.issues.find((i) => i.range.start === start)?.suggestions[0]?.text === it.decisions[0]!.suggestion) sugOk += 1; }
  }
  T = { n: T.n + s.items.length, agree: T.agree + agree, fa: T.fa + fa };
  console.log(`${s.set.padEnd(24)}${String(s.items.length).padStart(6)}${((100 * agree) / s.items.length).toFixed(1).padStart(7)}%${String(v).padStart(9)}${String(u).padStart(8)}${String(m).padStart(8)}${String(fa).padStart(9)}${(sugN ? `${sugOk}/${sugN}` : "-").padStart(8)}   ${disagree.join(" ")}`);
}
console.log(`TOTAL ${T.n} items; agreement with the assistant ${((100 * T.agree) / T.n).toFixed(1)}%; engine MISSPELLED where the assistant did not expect it: ${T.fa}`);
