import { LATIN_TO_CYRILLIC_LOOKALIKE } from "../tokenizer/normalize";

/**
 * Deterministic spelling rules. Each returns CANDIDATE repairs only; the
 * engine accepts a repair solely if it is itself VALID (lexicon / morphology),
 * so a rule can never invent a "correction" the engine would not accept as
 * correct text.
 */

export type Validator = (key: string) => boolean;

const STRICT_M = "аоуяё";
const STRICT_F = "эөүе";
const FEMININE_Y_SUFFIX: ReadonlyArray<readonly [string, string]> = [
  ["ын", "ийн"],
  ["ыг", "ийг"],
];

/** «ы»-suffix on a feminine stem (§10): …ын → …ийн, …ыг → …ийг. */
export function yiFeminineRepairs(key: string): string[] {
  const out: string[] = [];
  for (const [bad, good] of FEMININE_Y_SUFFIX) {
    if (key.endsWith(bad) && key.length > bad.length + 1) {
      out.push(key.slice(0, -bad.length) + good);
    }
  }
  return out;
}

/** Final consonant typed twice: хэргг → хэрэг is NOT this; хууль→хуульл is. */
export function doubledFinalRepairs(key: string): string[] {
  const n = key.length;
  if (n < 4) return [];
  const a = key[n - 1]!;
  if (a === key[n - 2] && !"аэиоуөүяеёюыи".includes(a)) {
    // R-DOUBLE-FINAL-LOAN-GUARD: a double final л н м с т ф б п р з к is how foreign words and names are written (тонн, грамм, билл,
    // хилл, холл, скотт, пресс, класс): the corpus is full of them, so a lone «хилл» is a name, not a slip. Only a letter that does
    // not double that way (г д ж х ч ш ц в й …: цомогг, алхх, ярьжж) or a TRIPLE (тоннн) is positive evidence of a typing slip.
    if ("лнмстфбпрзк".includes(a) && key[n - 3] !== a) return [];
    return [key.slice(0, -1)];
  }
  return [];
}

/** «ии» typed for «ий»: хуулиин → хуулийн, хуулии → хуулий. */
export function digraphIIRepairs(key: string): string[] {
  const out: string[] = [];
  const patterns: ReadonlyArray<readonly [RegExp, string]> = [
    [/ии(?=[бвгджзклмнпрстфхцчшщ])/u, "ий"], // шиидвэр → шийдвэр, хииж → хийж, хуулиин → хуулийн
    [/ии$/u, "ий"],
  ];
  for (const [re, rep] of patterns) {
    if (re.test(key)) out.push(key.replace(re, rep));
  }
  return [...new Set(out)].filter((r) => r !== key);
}

/** Trailing digits glued to a word: хууль2 → хууль. */
export function digitGluedRepair(text: string): string | null {
  const m = /^([\p{L}]+?)(\d+)$/u.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

/** Latin look-alikes inside a Cyrillic word: хyуль → хууль. */
export function lookalikeRepair(text: string): string | null {
  let changed = false;
  let out = "";
  for (const ch of text) {
    const rep = LATIN_TO_CYRILLIC_LOOKALIKE[ch];
    if (rep) {
      out += rep;
      changed = true;
    } else if (/[A-Za-z]/u.test(ch)) {
      return null; // a Latin letter with no look-alike: not a slip
    } else {
      out += ch;
    }
  }
  return changed ? out.toLowerCase() : null;
}

/** True when the word has both strictly masculine and strictly feminine vowels. */
export function hasStrictHarmonyBreak(key: string): boolean {
  let m = false;
  let f = false;
  for (const ch of key) {
    if (STRICT_M.includes(ch)) m = true;
    if (STRICT_F.includes(ch)) f = true;
  }
  return m && f;
}

const OBS_M = "аоуяёы";
const OBS_F = "эөүе";

/**
 * Is an observed suffix a genuine HARMONY BREAK against its stem? Only a strict
 * vowel of the opposite gender is positive evidence. A suffix made of neutral
 * letters («ийн», «ийг») against a masculine stem is a FORM-selection question
 * (хар+ийн vs харь+ийн, ам+ийг vs амь+ийг, аз+ийн vs Ази+н) that depends on
 * unlisted ь-stems, so it is never an accusation on its own.
 */
export function isHarmonyBreak(observedSuffix: string, stemGender: "M" | "F" | "MIXED"): boolean {
  if (stemGender === "MIXED") return false;
  // Suffix vowels follow the stem: the LAST strict vowel of the suffix is the one that carries harmony.
  let last: "M" | "F" | null = null;
  for (const c of observedSuffix) {
    if (OBS_M.includes(c)) last = "M";
    else if (OBS_F.includes(c)) last = "F";
  }
  return last !== null && last !== stemGender; // neutral-only suffix: no evidence
}

/** The stem a «ы»-suffix attaches to is feminine: only then is «ы» a harmony break. */
export function yiStemIsFeminine(key: string, harmonyGender: (stem: string) => "M" | "F" | "MIXED"): boolean {
  const stem = key.endsWith("ын") || key.endsWith("ыг") ? key.slice(0, -2) : key;
  return harmonyGender(stem) === "F";
}
