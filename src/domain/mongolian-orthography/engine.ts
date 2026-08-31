/**
 * Mongolian Cyrillic orthography — machine-checkable core from
 * toli.gov.mn «Зөв бичих дүрмийн журамласан толь» (§1–§10 foundation).
 * Official normative spelling; re-verify edge cases on toli.gov.mn.
 */

export type VowelClass = "masculine" | "feminine" | "neutral";

export type OrthographyIssueCode =
  | "UNKNOWN_LETTER"
  | "VOWEL_HARMONY"
  | "YI_IN_FEMININE"
  | "IY_PREFERRED_IN_FEMININE";

export type OrthographyIssue = {
  code: OrthographyIssueCode;
  ruleIds: readonly string[];
  word: string;
  message: string;
};

/** §1 — Mongolian Cyrillic alphabet (35 letters). */
export const MONGOLIAN_LETTERS = [
  "а",
  "б",
  "в",
  "г",
  "д",
  "е",
  "ё",
  "ж",
  "з",
  "и",
  "й",
  "к",
  "л",
  "м",
  "н",
  "о",
  "ө",
  "п",
  "р",
  "с",
  "т",
  "у",
  "ү",
  "ф",
  "х",
  "ц",
  "ч",
  "ш",
  "щ",
  "ъ",
  "ы",
  "ь",
  "э",
  "ю",
  "я",
] as const;

export type MongolianLetter = (typeof MONGOLIAN_LETTERS)[number];

/** §2 — vowels (13). */
export const VOWEL_LETTERS = new Set([
  "а",
  "э",
  "и",
  "о",
  "у",
  "ө",
  "ү",
  "я",
  "е",
  "ё",
  "ю",
  "й",
  "ы",
]);

/** §2 — consonants (20). */
export const CONSONANT_LETTERS = new Set([
  "б",
  "в",
  "г",
  "д",
  "ж",
  "з",
  "к",
  "л",
  "м",
  "н",
  "п",
  "р",
  "с",
  "т",
  "ф",
  "х",
  "ц",
  "ч",
  "ш",
  "щ",
]);

/** §2 — signs (2). */
export const SIGN_LETTERS = new Set(["ъ", "ь"]);

/** §3 — basic vowels (7 phonemes as letters). */
export const BASIC_VOWELS = new Set(["а", "э", "и", "о", "у", "ө", "ү"]);

/** §3 — auxiliary vowels. */
export const AUXILIARY_VOWELS = new Set(["я", "е", "ё", "ю", "й", "ы"]);

/** §16 — эгшигт гийгүүлэгч «Монгол баавар». */
export const VOWEL_REQUIRING_CONSONANTS = new Set([
  "м",
  "н",
  "г",
  "л",
  "б",
  "в",
  "р",
]);

/** §17 — заримдаг гийгүүлэгч. */
export const OPTIONAL_VOWEL_CONSONANTS = new Set([
  "д",
  "т",
  "ж",
  "з",
  "с",
  "ш",
  "ц",
  "ч",
  "х",
]);

/** §20 — онцгой (mostly foreign). */
export const SPECIAL_CONSONANTS = new Set(["к", "ф", "щ", "п"]);

const MASCULINE = new Set(["а", "о", "у", "я", "ё", "ы"]);
const FEMININE = new Set(["э", "ө", "ү", "е"]);
const NEUTRAL = new Set(["и", "й"]);

/**
 * §7 / §8 — classify a vowel letter in context.
 * `ю` is masculine with у-side, feminine with ү-side (simplified).
 */
export function classifyVowel(
  letter: string,
  nextLetters = "",
): VowelClass | null {
  const ch = letter.toLowerCase();
  if (MASCULINE.has(ch)) return "masculine";
  if (FEMININE.has(ch)) return "feminine";
  if (NEUTRAL.has(ch)) return "neutral";
  if (ch === "ю") {
    if (/^[үеө]/.test(nextLetters) || nextLetters.startsWith("ү")) {
      return "feminine";
    }
    if (/^[уаоыяё]/.test(nextLetters) || nextLetters.startsWith("у")) {
      return "masculine";
    }
    // default: treat bare ю as masculine (юм, оюун…)
    return "masculine";
  }
  return null;
}

/** §9 — labial follower after first-syllable vowel class. */
export function expectedLabialFollower(
  firstSyllableVowel: string,
): "а" | "э" | "о" | "ө" | null {
  const v = firstSyllableVowel.toLowerCase();
  if (v === "а" || v === "у" || v === "я" || v === "ю") return "а";
  if (v === "э" || v === "ү" || v === "и" || v === "е" || v === "й") return "э";
  if (v === "о" || v === "ё") return "о";
  if (v === "ө") return "ө";
  return null;
}

export function normalizeMongolianWord(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[«»""„‟']/g, "")
    .replace(/^[\s\-–—.,;:!?()[\]{}«»]+|[\s\-–—.,;:!?()[\]{}«»]+$/g, "")
    .toLowerCase();
}

export function isMongolianLetter(ch: string): boolean {
  const c = ch.toLowerCase();
  return (
    VOWEL_LETTERS.has(c) || CONSONANT_LETTERS.has(c) || SIGN_LETTERS.has(c)
  );
}

export function extractVowels(
  word: string,
): Array<{ letter: string; index: number; vowelClass: VowelClass }> {
  const normalized = normalizeMongolianWord(word);
  const out: Array<{ letter: string; index: number; vowelClass: VowelClass }> =
    [];
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    if (!VOWEL_LETTERS.has(ch)) continue;
    const rest = normalized.slice(i + 1);
    const vowelClass = classifyVowel(ch, rest);
    if (!vowelClass) continue;
    out.push({ letter: ch, index: i, vowelClass });
  }
  return out;
}

/** Known §8 гажилт endings / particles that mix classes in one token. */
const HARMONY_EXCEPTION_SUFFIX =
  /(?:жээ|чээ|гүй|бүс|чин|ийн|ыг|ийг)$/u;

/**
 * §8 — one word must not mix masculine and feminine vowels
 * (neutral allowed with either). Compounds / -жээ etc. are soft-skipped.
 */
export function checkVowelHarmony(word: string): OrthographyIssue | null {
  const normalized = normalizeMongolianWord(word);
  if (normalized.length < 2) return null;
  if (HARMONY_EXCEPTION_SUFFIX.test(normalized)) return null;

  const vowels = extractVowels(normalized);
  let seenMasculine = false;
  let seenFeminine = false;
  for (const item of vowels) {
    if (item.vowelClass === "masculine") seenMasculine = true;
    if (item.vowelClass === "feminine") seenFeminine = true;
  }
  if (seenMasculine && seenFeminine) {
    return {
      code: "VOWEL_HARMONY",
      ruleIds: ["§8"],
      word: normalized,
      message:
        "Нэг үгэнд эр, эм эгшиг хамтран орсон байна (§8 эгшиг зохицох ёс). Нийлмэл үг биш бол шалгана уу.",
    };
  }
  return null;
}

/**
 * §10 — ы only in masculine words; feminine uses ий.
 * Gender is inferred from the stem with genitive-like endings stripped.
 */
export function checkYiSpelling(word: string): OrthographyIssue | null {
  const normalized = normalizeMongolianWord(word);
  if (!normalized.includes("ы")) return null;

  const stem = normalized
    .replace(/(?:ыг|ийг|ын|ийн|ы|ий)$/u, "")
    .replace(/ы/g, "");
  if (!stem) return null;

  const gender = inferWordGender(stem);
  if (gender === "feminine") {
    return {
      code: "YI_IN_FEMININE",
      ruleIds: ["§10"],
      word: normalized,
      message:
        "ы үсгийг эм үгэнд бичихгүй; эм үгэнд ий бичнэ (§10).",
    };
  }
  return null;
}

export function checkUnknownLetters(word: string): OrthographyIssue | null {
  const normalized = normalizeMongolianWord(word);
  for (const ch of normalized) {
    if (/[0-9a-zA-Z]/.test(ch)) continue;
    if (ch === "-" || ch === "'" || ch === "\u2019") continue;
    if (!isMongolianLetter(ch)) {
      return {
        code: "UNKNOWN_LETTER",
        ruleIds: ["§1"],
        word: normalized,
        message: `«${ch}» монгол кирилл цагаан толгойн үсэг биш (§1).`,
      };
    }
  }
  return null;
}

export function checkMongolianWord(word: string): OrthographyIssue[] {
  const normalized = normalizeMongolianWord(word);
  if (!normalized) return [];
  // Skip pure Latin / numeric tokens.
  if (!/[а-яөүёА-ЯӨҮЁ]/.test(normalized)) return [];

  const issues: OrthographyIssue[] = [];
  const unknown = checkUnknownLetters(normalized);
  if (unknown) issues.push(unknown);
  const harmony = checkVowelHarmony(normalized);
  if (harmony) issues.push(harmony);
  const yi = checkYiSpelling(normalized);
  if (yi) issues.push(yi);
  return issues;
}

const WORD_RE = /[A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫы]+(?:-[A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫы]+)*/gu;

export function scanMongolianText(text: string): OrthographyIssue[] {
  const issues: OrthographyIssue[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(WORD_RE)) {
    const word = match[0] ?? "";
    const key = normalizeMongolianWord(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    issues.push(...checkMongolianWord(word));
  }
  return issues;
}

/** Word gender for suffix advice — §7. */
export function inferWordGender(
  word: string,
): "masculine" | "feminine" | "unknown" {
  const vowels = extractVowels(word);
  const hasMasculine = vowels.some((v) => v.vowelClass === "masculine");
  const hasFeminine = vowels.some((v) => v.vowelClass === "feminine");
  if (hasMasculine && !hasFeminine) return "masculine";
  if (hasFeminine && !hasMasculine) return "feminine";
  if (!hasMasculine && vowels.some((v) => v.vowelClass === "neutral")) {
    return "feminine";
  }
  return "unknown";
}
