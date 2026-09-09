import { normalizeMongolianWord } from "@/domain/mongolian-orthography/engine";
import {
  LEGAL_LEXICON_STEMS,
  LEGAL_LEXICON_WORDS,
} from "@/domain/mongolian-orthography/legal-lexicon";
import { levenshteinDistance } from "@/domain/mongolian-orthography/levenshtein";

/** High-confidence typo to correction pairs (spellcheck.mn-style daily errors). */
const COMMON_TYPO_CORRECTIONS: Record<string, string> = {
  хунэтаи: "хүнтэй",
  хүнэтаи: "хүнтэй",
  хунэтэй: "хүнтэй",
  гэрээсэй: "гэрээсээ",
  өчигдр: "өчигдөр",
  өчигдөөр: "өчигдөр",
  очидөр: "өчигдөр",
  хувцаа: "хувцас",
  хувцаса: "хувцас",
  явч: "яавч",
  явач: "яавч",
};

const CORE_DICTIONARY_WORDS = [
  "би", "чи", "та", "тэр", "энэ", "тэд", "бид", "минь", "чинь", "нь",
  "намайг", "чамайг", "түүнийг", "биднийг", "танайг", "тэднийг",
  "надад", "чамд", "түүнд", "бидэнд", "танд", "тэдэнд",
  "бол", "бай", "байна", "байсан", "байгаа", "байж", "байх", "болно", "болсон",
  "юм", "вэ", "уу", "үү", "бэ", "бүү", "ч", "харин", "гэхдээ", "учир нь",
  "мөн", "эсвэл", "болон", "тэгээд", "дараа", "өмнө", "одоо", "өнөөдөр",
  "өчигдөр", "маргааш", "яагаад", "хэрхэн", "хэн", "юу", "хаана",
  "манай", "гэр", "гэрт", "гэртээ", "гэрээ", "гэрээс", "гэрээсээ", "гэртэй",
  "хүн", "хүний", "хүнд", "хүнтэй", "хүмүүс", "хоёр", "гурав", "дөрөв",
  "анх", "удаа", "анх удаа", "танил", "танилцах", "танилцаж", "танилцсан",
  "хувцас", "солилцох", "солилцож", "солилцсон",
  "явах", "яав", "яавч", "явсан", "ирэх", "ирсэн", "буцаж", "буцах",
  "өглөө", "орой", "шөнө", "өдөр", "цаг", "минут", "жил", "сар",
  "хууль", "хуулийн", "хууль зүй", "эрх", "эрх зүй", "эрх зүйн", "эрхтэй",
  "хэрэг", "хэргийн", "шүүх", "шүүгч", "шийдвэр", "нэхэмжлэл", "хариу",
  "хариуцлага", "гэмт", "гэмт хэрэг", "гэмт үйлдэл", "баримт", "баримт бичиг",
  "нотлох", "нотлох баримт", "гэрч", "мэдүүлэг", "өмгөөлөгч", "хохирогч",
  "шинжилгээ", "шинжлэх", "дүгнэлт", "санал", "гэрээ", "зөрчил", "маргаан",
  "бодлого", "бодох", "бодож", "заалт", "зүйл", "тогтоол", "ял", "торгууль",
  "хийх", "хийж", "хийсэн", "өгөх", "авах", "авч", "авсан", "хэлэх", "хэлсэн",
  "бичих", "бичсэн", "унших", "уншсэн", "сурах", "сурсан", "ажиллах", "ажил",
  "олох", "олсон", "мэдэх", "мэдсэн", "харах", "харсан", "шалгах", "шалгаж",
  "зөв", "буруу", "сайн", "муу", "их", "бага", "шинэ", "хуучин", "том", "жижиг",
  "улс", "хот", "аймаг", "сум", "байр", "зам", "гудамж",
  "нэг", "тав", "зургаа", "долоо", "найм", "ес", "арав",
  "асуудал", "асуулт", "хариулт", "тайлбар", "жишээ", "утга", "үг", "үгс",
  "өгүүлбэр", "бичиг", "ном", "сургалт", "сургууль", "багш", "оюутан",
  "иргэн", "иргэд", "захиргаа", "захиргааны", "иргэний", "эрүүгийн", "мөнгө", "төлбөр",
  "үнэ", "үнэгүй", "төлбөртэй", "багц", "үйлчилгээ", "систем", "програм",
  "мэдээлэл", "технологи", "интернет", "файл", "хавсралт",
] as const;

/** Longest-first suffixes for morphological recognition (not typo correction). */
const MORPHOLOGICAL_SUFFIXES = [
  "аас", "ээс", "оос", "өөс", "оор", "өөр", "аар", "ээр", "гээр", "руу", "рүү",
  "лаас", "лээс", "гаар", "гээр", "тай", "тэй", "гүй", "гүйгээр", "гүйгээр",
  "ын", "ийн", "ны", "ний", "ыг", "ийг", "г", "г", "д", "т", "нд", "н", "с",
  "сэн", "сон", "сан", "дсон", "той", "ж", "в", "х", "өө", "өх",
  "л", "р", "м", "к", "даа", "дээ", "уу", "үү", "ууд", "үүд",
] as const;

const DICTIONARY = new Set<string>();
const STEMS = new Set<string>();
/** Fully-formed words only (never a bare morphological stem) — the only
 * pool fuzzy typo-matching may suggest from, so a suggestion is always a
 * real, complete word. */
const COMPLETE_WORDS = new Set<string>();

function addWord(raw: string) {
  const normalized = normalizeMongolianWord(raw);
  if (normalized.length >= 2) {
    DICTIONARY.add(normalized);
    COMPLETE_WORDS.add(normalized);
  }
}

function addStem(raw: string) {
  const normalized = normalizeMongolianWord(raw);
  if (normalized.length >= 2) {
    STEMS.add(normalized);
    DICTIONARY.add(normalized);
  }
}

for (const raw of CORE_DICTIONARY_WORDS) {
  for (const part of raw.split(/\s+/u)) {
    addWord(part);
  }
}

for (const word of LEGAL_LEXICON_WORDS) {
  addWord(word);
}

for (const stem of LEGAL_LEXICON_STEMS) {
  addStem(stem);
}

const STEM_EXPANSIONS = [
  "гэр", "хүн", "хувцас", "хууль", "хуульч", "хэрэг", "баримт", "эрх", "асуудал",
  "шүүх", "гэрээ", "ажил", "бичиг", "асуулт", "хариулт", "шинжилгээ",
  "заалт", "зүйл", "хэсэг", "ял", "хариуцлага", "хохирол", "нөхөн",
] as const;

const SHORT_SUFFIXES = [
  "", "т", "д", "аас", "ээс", "руу", "тай", "тэй", "ийн", "ын", "ийг", "ыг",
  "д", "г", "с", "нд",
];

for (const stem of STEM_EXPANSIONS) {
  addStem(stem);
  for (const suffix of SHORT_SUFFIXES) {
    addWord(`${stem}${suffix}`);
  }
}

for (const [, correction] of Object.entries(COMMON_TYPO_CORRECTIONS)) {
  addWord(correction);
}

const ELISION_VOWELS = ["а", "о", "у", "ы", "э", "и", "ө", "ү"] as const;
const ELISION_CONSONANT_PAIR_RE = /^[бвгджзклмнпрстфхцчшщ]{2}$/u;

/**
 * Many 2+ syllable Mongolian nouns drop the stem's last short vowel when a
 * vowel-initial suffix follows: хэрэг+ээс → хэргээс, асуудал+ыг → асуудлыг,
 * ажил+аас → ажлаас. Plain suffix-stripping leaves a stem ending in two
 * consonants ("хэрг", "асуудл", "ажл") that never matches the dictionary,
 * so those perfectly correct forms looked unknown. This reconstructs the
 * elided vowel — try each vowel between the stem's last two consonants and
 * accept only an unambiguous dictionary hit, so an actual typo (which
 * would need the same lucky, unique reconstruction) is very unlikely to
 * be mistaken for one of these.
 */
function matchesElidedStem(stem: string): boolean {
  if (stem.length < 3) return false;
  const lastTwo = stem.slice(-2);
  if (!ELISION_CONSONANT_PAIR_RE.test(lastTwo)) return false;
  const before = stem.slice(0, -2);

  let found: string | null = null;
  for (const vowel of ELISION_VOWELS) {
    const candidate = `${before}${lastTwo[0]}${vowel}${lastTwo[1]}`;
    if (DICTIONARY.has(candidate) || STEMS.has(candidate)) {
      if (found && found !== candidate) return false;
      found = candidate;
    }
  }
  return found !== null;
}

function matchesMorphology(word: string): boolean {
  if (DICTIONARY.has(word) || STEMS.has(word)) {
    return true;
  }

  for (const suffix of MORPHOLOGICAL_SUFFIXES) {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 1) {
      continue;
    }
    const stem = word.slice(0, -suffix.length);
    if (DICTIONARY.has(stem) || STEMS.has(stem)) {
      return true;
    }
    if (matchesElidedStem(stem)) {
      return true;
    }
    for (const suffix2 of MORPHOLOGICAL_SUFFIXES) {
      if (!stem.endsWith(suffix2) || stem.length <= suffix2.length + 1) {
        continue;
      }
      const stem2 = stem.slice(0, -suffix2.length);
      if (DICTIONARY.has(stem2) || STEMS.has(stem2)) {
        return true;
      }
      if (matchesElidedStem(stem2)) {
        return true;
      }
    }
  }

  return false;
}

export function isKnownMongolianWord(word: string): boolean {
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2) return true;
  if (!/[а-яөүё]/u.test(normalized)) return true;
  return matchesMorphology(normalized);
}

const FUZZY_MIN_WORD_LENGTH = 4;
const FUZZY_MAX_DISTANCE = 1;

/**
 * Single-edit ("one typo") fuzzy match against COMPLETE_WORDS only.
 * Deliberately narrow to keep false positives on legal terminology out:
 * distance must be exactly 1, the unknown word must be at least 4
 * characters (so short words like "тэр"/"тэс" never collide), and the
 * match must be unambiguous — if two dictionary words are both one edit
 * away, neither is suggested, since guessing wrong is worse than saying
 * nothing.
 */
function fuzzyDictionaryMatch(normalized: string): readonly string[] {
  if (normalized.length < FUZZY_MIN_WORD_LENGTH) return [];

  let match: string | null = null;
  for (const candidate of COMPLETE_WORDS) {
    if (Math.abs(candidate.length - normalized.length) > FUZZY_MAX_DISTANCE) {
      continue;
    }
    if (levenshteinDistance(normalized, candidate) !== FUZZY_MAX_DISTANCE) {
      continue;
    }
    if (match && match !== candidate) {
      return [];
    }
    match = candidate;
  }

  return match ? [match] : [];
}

/**
 * Suggest spelling fixes: the high-confidence typo map first, then (unless
 * `highConfidenceOnly` is set, e.g. the word already triggered a harmony
 * warning) a conservative single-edit fuzzy match against known complete
 * words. Fuzzy matching against the *full* legal lexicon used to be
 * disabled outright because it produced false positives like
 * нөхөн→хэрхэн; restricting it to distance-1 + unambiguous + complete
 * words only removes that failure mode (multi-edit or ambiguous pairs are
 * never suggested).
 */
export function suggestDictionaryWords(
  word: string,
  limit = 5,
  options?: { highConfidenceOnly?: boolean },
): readonly string[] {
  void limit;
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2) return [];
  if (isKnownMongolianWord(normalized)) return [];

  const mapped = COMMON_TYPO_CORRECTIONS[normalized];
  if (mapped && isKnownMongolianWord(mapped)) {
    return [mapped];
  }

  if (options?.highConfidenceOnly) return [];

  return fuzzyDictionaryMatch(normalized);
}

export function dictionarySizeForTests(): number {
  return DICTIONARY.size;
}
