/**
 * UNKNOWN taxonomy classifier (shared by unknown-taxonomy.ts and benchmark-v3.ts). HEURISTIC to rank engineering work, never evidence
 * for accepting a word: nothing here makes a word VALID. Needs local research data (second-opinion dictionary + frequency table).
 */
import type { SpellEngineV1 } from "../../../src/spell-engine";
import { nounSuffixes, verbSuffixes } from "./suffix-inventory";

export type Category =
  | "TOKENIZER_FAILURE"
  | "ABBREVIATION"
  | "PROPER_NAME"
  | "COMPOUND"
  | "DERIVATIONAL_FORM"
  | "MISSING_INFLECTION"
  | "LOANWORD"
  | "TECHNICAL_TERM"
  | "MISSING_LEMMA"
  | "TRUE_UNKNOWN";
export type TypeRec = { key: string; n: number; titleOnly: boolean; upperOnly: boolean; sample: string };
type Freq = { pm(key: string): number; name(key: string): number } | undefined;
type Oracle = { accepts(key: string): boolean };

const DERIVATIONAL = ["лаг", "лэг", "лөг", "лог", "лт", "лал", "лэл", "лол", "лөл", "гч", "агч", "эгч", "ууч", "үүч", "мж", "амж", "эмж", "ц", "лцаа", "лцэх", "лцах", "ьт", "аач", "ээч", "уул", "үүл", "ил", "иг", "аан", "лан", "лэн", "лон", "лөн", "аа", "ээ", "оо", "өө", "уур", "үүр", "уулал", "үүлэл", "чин", "ч", "тан", "тэн", "жил", "жуул"];
const TECH_ENDINGS = /(логи|логийн|метр|граф|графи|фон|скоп|генез|патия|терапи|электр|биолог|химич|физик|кибер|нано|микро|макро|авто|гео|био|эко|радио|видео|диджитал)/;
const LOAN_ENDINGS = /(изм|ист|ци|тор|ер|инг|ация|ик|ал|ив|ент|ант|ент|ура|ум|ус|ёр|мент|лайн|шн|тек|сс|кс)$/;
const VOWELS = ["а", "э", "о", "ө", "и", "у", "ү"];


export function buildClassifier(eng: SpellEngineV1, hs: Oracle, freq: Freq): (t: TypeRec) => { cat: Category; evidence: string } {
  const lemmas = new Set<string>();
  for (const k of eng.lexicon.keys()) lemmas.add(k);
  const suffixes = new Set([...nounSuffixes(), ...verbSuffixes()]);
  const isChain = (r: string): boolean => r === "" || suffixes.has(r) || [...suffixes].some((a) => r.startsWith(a) && (suffixes.has(r.slice(a.length)) || [...suffixes].some((b) => r.slice(a.length).startsWith(b) && suffixes.has(r.slice(a.length + b.length)))));
  const lemmaForm = (head: string): string | null => {
    if (lemmas.has(head)) return head;
    if (lemmas.has(`${head}ь`)) return `${head}ь`;
    for (const v of VOWELS) if (lemmas.has(`${head.slice(0, -1)}${v}${head.slice(-1)}`)) return `${head.slice(0, -1)}${v}${head.slice(-1)}`;
    for (const v of VOWELS) if (lemmas.has(`${head}${v}`)) return `${head}${v}`;
    return null;
  };

  return (t: TypeRec): { cat: Category; evidence: string } => {
    const k = t.key;
    const pm = freq ? freq.pm(k) : 0;
    const name = freq ? freq.name(k) : 0;
    const inDict = hs.accepts(k);
    if (k.length <= 1 || !/^[а-яёөү-]+$/u.test(k)) return { cat: "TOKENIZER_FAILURE", evidence: "stray/junk" };
    if (t.upperOnly && k.length <= 6) return { cat: "ABBREVIATION", evidence: "always upper-case" };
    if (name > 0.6 || (!freq && t.titleOnly)) return { cat: "PROPER_NAME", evidence: `name=${name.toFixed(2)}` };
    // compound: two known lemmas (first ≥3, second ≥3) + optional suffix chain
    for (let i = Math.min(k.length - 3, 10); i >= 3; i -= 1) {
      const a = lemmaForm(k.slice(0, i));
      if (!a || a.length < 3) continue;
      const rest = k.slice(i);
      for (let j = rest.length; j >= 3; j -= 1) {
        const b = lemmaForm(rest.slice(0, j));
        if (b && b.length >= 3 && isChain(rest.slice(j))) return { cat: "COMPOUND", evidence: `${a}+${b}${rest.slice(j) ? "+" + rest.slice(j) : ""}` };
      }
    }
    // derivational: lemma + derivational suffix (+ inflection)
    for (let i = Math.min(k.length - 2, 12); i >= 3; i -= 1) {
      const head = lemmaForm(k.slice(0, i));
      if (!head) continue;
      const rest = k.slice(i);
      for (const d of DERIVATIONAL) if (rest.startsWith(d) && isChain(rest.slice(d.length)) && inDict) return { cat: "DERIVATIONAL_FORM", evidence: `${head}+${d}${rest.slice(d.length) ? "+" + rest.slice(d.length) : ""}` };
    }
    // missing inflection
    for (let i = Math.min(k.length - 1, 12); i >= 2; i -= 1) {
      const head = lemmaForm(k.slice(0, i));
      if (!head) continue;
      const rest = k.slice(i);
      if (rest && isChain(rest) && inDict) return { cat: "MISSING_INFLECTION", evidence: `${head}+${rest}` };
    }
    if (!inDict && TECH_ENDINGS.test(k)) return { cat: "TECHNICAL_TERM", evidence: "tech stem" };
    if (!inDict && pm >= 0.5 && (LOAN_ENDINGS.test(k) || /[фвцщ]/.test(k) || /(?:^|[^аэоөуүи])(?:кр|тр|пр|гр|бр|кл|пл|стр|ск|сп|ст)/.test(k))) return { cat: "LOANWORD", evidence: "loan-like orthography" };
    if (inDict) return { cat: "MISSING_LEMMA", evidence: "dictionary accepts; no known lemma" };
    return { cat: "TRUE_UNKNOWN", evidence: pm < 0.5 ? "rare, rejected" : "frequent, rejected" };
  };
}
