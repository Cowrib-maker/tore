import { normalizeMongolianWord } from "@/domain/mongolian-orthography/engine";
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

function relaxedSpellingKey(word: string): string {
  return word
    .replace(/[өүэеи]/gu, "e")
    .replace(/[аоуяёы]/gu, "a");
}

function spellingDistance(a: string, b: string): number {
  const direct = levenshteinDistance(a, b);
  const relaxed = levenshteinDistance(
    relaxedSpellingKey(a),
    relaxedSpellingKey(b),
  );
  return Math.min(direct, relaxed);
}

const CORE_DICTIONARY_WORDS = [
  "би", "чи", "та", "тэр", "энэ", "тэд", "бид", "минь", "чинь", "нь",
  "бол", "бай", "байна", "байсан", "байгаа", "байж", "байх", "болно", "болсон",
  "юм", "вэ", "уу", "үү", "бэ", "бүү", "ч", "харин", "гэхдээ", "учир нь",
  "мөн", "эсвэл", "болон", "тэгээд", "дараа", "өмнө", "одоо", "өнөөдөр",
  "өчигдөр", "маргааш", "энэ", "тэр", "яагаад", "хэрхэн", "хэн", "юу", "хаана",
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
  "нэг", "хоёр", "гурав", "дөрөв", "тав", "зургаа", "долоо", "найм", "ес", "арав",
  "асуудал", "асуулт", "хариулт", "тайлбар", "жишээ", "утга", "үг", "үгс",
  "өгүүлбэр", "бичиг", "ном", "сургалт", "сургууль", "багш", "оюутан",
  "иргэн", "захиргаа", "захиргааны", "иргэний", "эрүүгийн", "мөнгө", "төлбөр",
  "үнэ", "үнэгүй", "төлбөртэй", "багц", "үйлчилгээ", "систем", "програм",
  "мэдээлэл", "технологи", "интернет", "файл", "хавсралт",
] as const;

const DICTIONARY = new Set<string>();

for (const raw of CORE_DICTIONARY_WORDS) {
  for (const part of raw.split(/\s+/u)) {
    const normalized = normalizeMongolianWord(part);
    if (normalized.length >= 2) {
      DICTIONARY.add(normalized);
    }
  }
}

const STEM_EXPANSIONS = [
  "гэр", "хүн", "хувцас", "хууль", "хэрэг", "баримт", "эрх", "асуудал",
  "шүүх", "гэрээ", "ажил", "бичиг", "асуулт", "хариулт", "шинжилгээ",
] as const;

const SUFFIXES = [
  "", "т", "д", "аас", "ээс", "руу", "тай", "тэй", "ийн", "ын", "ийг", "ыг",
];

for (const stem of STEM_EXPANSIONS) {
  for (const suffix of SUFFIXES) {
    const combined = normalizeMongolianWord(`${stem}${suffix}`);
    if (combined.length >= 2) {
      DICTIONARY.add(combined);
    }
  }
}

export function isKnownMongolianWord(word: string): boolean {
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2) return true;
  if (!/[а-яөүё]/u.test(normalized)) return true;
  return DICTIONARY.has(normalized);
}

export function suggestDictionaryWords(
  word: string,
  limit = 5,
  options?: { highConfidenceOnly?: boolean },
): readonly string[] {
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2) return [];
  if (DICTIONARY.has(normalized)) return [];

  const mapped = COMMON_TYPO_CORRECTIONS[normalized];
  if (mapped && DICTIONARY.has(mapped)) {
    return [mapped];
  }

  if (options?.highConfidenceOnly) {
    return [];
  }

  const maxDistance =
    normalized.length <= 4 ? 1 : normalized.length <= 7 ? 2 : 3;

  const scored: Array<{ word: string; distance: number }> = [];
  for (const candidate of DICTIONARY) {
    if (Math.abs(candidate.length - normalized.length) > maxDistance + 1) {
      continue;
    }
    const distance = spellingDistance(normalized, candidate);
    if (distance > maxDistance) continue;
    scored.push({ word: candidate, distance });
  }

  scored.sort(
    (a, b) =>
      a.distance - b.distance ||
      Math.abs(a.word.length - normalized.length) -
        Math.abs(b.word.length - normalized.length) ||
      a.word.localeCompare(b.word, "mn"),
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of scored) {
    if (seen.has(item.word)) continue;
    seen.add(item.word);
    out.push(item.word);
    if (out.length >= limit) break;
  }
  return out;
}

export function dictionarySizeForTests(): number {
  return DICTIONARY.size;
}
