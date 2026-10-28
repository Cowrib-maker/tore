/**
 * Evidence-ranked VERB morphology gaps: which suffix endings does the second-opinion dictionary accept on many lexicon verbs while our
 * analyzer rejects them? (A suffix ending is only reported when ≥ MIN verbs show it, so lemma-specific oracle quirks do not appear.)
 *   npx tsx scripts/spell-data/verb-gap-analysis.ts
 * The candidate endings below are written from general grammar knowledge; the oracle only says which of them are productive.
 */
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { loadHunspellResearchProvider } from "./lib/hunspell-provider";

const MIN = 12;
// vowel-harmony pairs are expressed as back/front stems: each ending lists {a: back-vowel form, e: front-vowel form}
const ENDINGS: [name: string, a: string, e: string][] = [
  ["causative -уул/-үүл", "уул", "үүл"], ["causative -лга", "лга", "лгэ"], ["passive -гд", "гдах", "гдэх"], ["passive -д", "дах", "дэх"], ["reflexive -лц", "лцах", "лцэх"],
  ["imperative -аарай", "аарай", "ээрэй"], ["imperative -гтун", "гтун", "гтүн"], ["optative -аасай", "аасай", "ээсэй"], ["-сугай", "сугай", "сүгэй"], ["-тугай", "тугай", "түгэй"],
  ["cvb -аад", "аад", "ээд"], ["cvb -хаар", "хаар", "хээр"], ["cvb -хлаар", "хлаар", "хлээр"], ["cvb -тал", "тал", "тэл"], ["cvb -магц", "магц", "мэгц"],
  ["cvb -маар", "маар", "мээр"], ["cvb -ангуут", "ангуут", "энгүүт"], ["cvb -саар", "саар", "сээр"], ["cvb -ахдаа", "ахдаа", "эхдээ"], ["cvb -хад", "хад", "хэд"],
  ["ptcp -аагүй", "аагүй", "ээгүй"], ["ptcp -сан", "сан", "сэн"], ["ptcp -даг", "даг", "дэг"], ["ptcp -ах", "ах", "эх"], ["ptcp -маар", "маар", "мээр"],
  ["ptcp -маар", "мааргүй", "мээргүй"], ["ptcp -аагүйгээр", "аагүйгээр", "ээгүйгээр"], ["fut -на", "на", "нэ"], ["fut -ах", "ах", "эх"], ["pres -даг", "даг", "дэг"],
  ["past -лаа", "лаа", "лээ"], ["past -жээ", "жээ", "жээ"], ["hort -я", "я", "е"], ["hort -яа", "яа", "ээ"], ["cond -вал", "вал", "вэл"], ["cond -бал", "бал", "бэл"],
  ["-аарай", "аарай", "ээрэй"], ["-чихсан", "чихсан", "чихсэн"], ["-чих", "чих", "чих"], ["-сан хойно", "санаас", "сэнээс"], ["-саны", "саны", "сэний"],
  ["-гаад", "гаад", "гээд"], ["-цгаа", "цгаа", "цгээ"], ["-хыг", "хыг", "хийг"], ["-хын", "хын", "хийн"], ["-хаа", "хаа", "хээ"], ["-даггүй", "даггүй", "дэггүй"],
  ["-лгүй", "лгүй", "лгүй"], ["-аагүй", "аагүй", "ээгүй"], ["-ж байна", "ж", "ж"], ["-н", "н", "н"], ["-ан", "ан", "эн"], ["-мгц", "магц", "мэгц"],
  ["-уулж", "уулж", "үүлж"], ["-уулах", "уулах", "үүлэх"], ["-уулан", "уулан", "үүлэн"], ["-лаа", "лаа", "лээ"], ["-аа", "аа", "ээ"], ["-хдаа", "хдаа", "хдээ"],
];

async function main() {
  const oracle = await loadHunspellResearchProvider();
  const eng = createSpellEngineV1();
  const verbs: string[] = [];
  for (const k of eng.lexicon.keys()) { const e = eng.lexicon.lookup(k).find((x) => x.pos === "V" && !x.formOnly); if (e && k.endsWith("х") && k.length >= 5 && oracle.accepts(k)) verbs.push(k); }
  const isFront = (w: string) => /[эөүе]/u.test(w);
  const res: { name: string; oracleOnly: number; both: number; ex: string[] }[] = [];
  for (const [name, a, e] of ENDINGS) {
    let oracleOnly = 0, both = 0; const ex: string[] = [];
    for (const v of verbs) {
      const stem = v.slice(0, -1);
      const end = isFront(v) ? e : a;
      for (const st of [stem, stem.slice(0, -1)]) {
        const w = st + end;
        if (!oracle.accepts(w)) continue;
        const ours = eng.analyze(`и ${w}`).tokens[1]!.verdict === "VALID";
        if (ours) both += 1; else { oracleOnly += 1; if (ex.length < 4) ex.push(w); }
        break;
      }
    }
    res.push({ name, oracleOnly, both, ex });
  }
  console.log(`verbs judged: ${verbs.length}  (gap = the oracle accepts the form on a verb, we do not; ≥${MIN} verbs to count)`);
  for (const r of res.filter((x) => x.oracleOnly >= MIN).sort((a, b) => b.oracleOnly - a.oracleOnly)) console.log(`${r.name.padEnd(24)} gap ${String(r.oracleOnly).padStart(4)} · both ${String(r.both).padStart(4)} · e.g. ${r.ex.join(", ")}`);
  oracle.dispose();
}
void main();
