/**
 * Mongolian Cyrillic phonology needed for suffix selection.
 *
 * Vowel harmony: masculine (back) а о у я ё ы, feminine (front) э ө ү е,
 * neutral и (and the semivowel й, which is not a vowel here). «ю» is
 * ambiguous and is skipped unless it is the only vowel. A word's suffix
 * vowels agree with its stem vowels.
 *
 * Words whose vowels mix genders (loanwords, compounds) are reported as
 * MIXED: the engine then accepts either gender of a suffix and never claims a
 * harmony error, because it cannot know which vowel the speaker follows.
 */

export type Gender = "M" | "F";
export type StemGender = Gender | "MIXED";

const MASC = new Set(["а", "о", "у", "я", "ё", "ы"]);
const FEM = new Set(["э", "ө", "ү", "е"]);
const VOWELS = new Set([...MASC, ...FEM, "и", "ю"]);

export function isVowel(ch: string): boolean {
  return VOWELS.has(ch);
}

export function isConsonantLetter(ch: string): boolean {
  return /^[бвгджзйклмнпрстфхцчшщъь]$/u.test(ch);
}

export type Harmony = {
  gender: StemGender;
  /** Gender of the last non-neutral vowel (what a loanword's suffix follows). */
  lastGender: Gender;
  hasO: boolean; // contains о
  hasOE: boolean; // contains ө
  lastVowel: string | null;
};

export function harmonyOf(word: string, forced?: StemGender): Harmony {
  let sawM = false;
  let sawF = false;
  let last: Gender | null = null;
  let lastVowel: string | null = null;
  let sawI = false;
  let sawYu = false;
  for (const ch of word) {
    if (MASC.has(ch)) {
      sawM = true;
      last = "M";
      lastVowel = ch;
    } else if (FEM.has(ch)) {
      sawF = true;
      last = "F";
      lastVowel = ch;
    } else if (ch === "и") {
      sawI = true;
      lastVowel = ch;
    } else if (ch === "ю") {
      sawYu = true;
      lastVowel = ch;
    }
  }
  let gender: StemGender;
  if (forced) gender = forced;
  else if (sawM && sawF) gender = "MIXED";
  // Masculine stem whose LAST vowel is «и» (турник, студи, байшин): speakers
  // attach either gender (турникийн/турниктэй), so we stay lenient.
  else if (sawM && !sawF && lastVowel === "и") gender = "MIXED";
  else if (sawM) gender = "M";
  else if (sawF) gender = "F";
  else if (sawYu) gender = "M";
  else if (sawI) gender = "F"; // only «и»: feminine (бичиг → бичгийн)
  else gender = "M";
  return {
    gender,
    lastGender: last ?? (gender === "MIXED" ? "M" : gender),
    hasO: word.includes("о"),
    hasOE: word.includes("ө"),
    lastVowel,
  };
}

/** Mixed-harmony check used by the §8 rule (exceptions are handled by callers). */
export function isHarmonyMixed(word: string): boolean {
  return harmonyOf(word).gender === "MIXED";
}

export type StemClass = "C" | "Y" | "V" | "SOFT";

export function stemClassOf(stem: string): StemClass {
  const last = stem[stem.length - 1] ?? "";
  if (last === "ь") return "SOFT";
  if (last === "й") return "Y";
  if (isVowel(last)) return "V";
  return "C";
}

/**
 * Stems after which the genitive/accusative take «ий» even when masculine.
 * «к» (foreign: банк, танк, лак, марк, аммиак) joins ш ч ж щ ц г: the
 * oracle lists банкийг / маркийн / лакийн for all 6 к-final loanwords it holds
 * (M1.1: 10 false violations removed).
 */
export function takesIForm(stem: string): boolean {
  const last = stem[stem.length - 1] ?? "";
  if ("шчжщцгк".includes(last)) return true;
  const h = harmonyOf(stem);
  return h.lastVowel === "и";
}
