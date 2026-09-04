import { normalizeMongolianWord } from "@/domain/mongolian-orthography/engine";
import { levenshteinDistance } from "@/domain/mongolian-orthography/levenshtein";

const COMMON_TYPO_CORRECTIONS: Record<string, string> = {
  хунэтаи: "хүнтэй", хүнэтаи: "хүнтэй", хунэтэй: "хүнтэй", гэрээсэй: "гэрээсээ",
  өчигдр: "өчигдөр", өчигдөөр: "өчигдөр", очидөр: "өчигдөр", хувцаа: "хувцас",
  хувцаса: "хувцас", явч: "яавч", явач: "яавч", яагаий: "яагаад", яагаи: "яагаад",
  зантэй: "зантай", зантаи: "зантай", занта: "зантай", хүнийхээ: "хүнийхээ",
};

function relaxedSpellingKey(word: string): string { return word.replace(/[өүэеи]/gu, "e").replace(/[аоуяёы]/gu, "a"); }
function spellingDistance(a: string, b: string): number { return Math.min(levenshteinDistance(a, b), levenshteinDistance(relaxedSpellingKey(a), relaxedSpellingKey(b))); }

const CORE_DICTIONARY_WORDS = [
  "би", "чи", "та", "тэр", "энэ", "тэд", "бид", "минь", "чинь", "нь", "бол", "бай", "байна", "байсан", "байгаа", "байж", "байх", "болно", "болсон", "юм", "вэ", "уу", "үү", "бэ", "бүү", "ч", "харин", "гэхдээ", "учир нь", "мөн", "эсвэл", "болон", "тэгээд", "дараа", "өмнө", "одоо", "өнөөдөр", "өчигдөр", "маргааш", "яагаад", "яагаад", "яагаад", "хэрхэн", "хэн", "юу", "хаана", "яагаад", "манай", "гэр", "гэрт", "гэртээ", "гэрээ", "гэрээс", "гэрээсээ", "гэртэй", "хүн", "хүний", "хүнд", "хүнтэй", "хүмүүс", "хоёр", "гурав", "дөрөв", "анх", "удаа", "танил", "танилцах", "танилцаж", "танилцсан", "хувцас", "солилцох", "солилцож", "солилцсон", "явах", "яав", "яавч", "явсан", "ирэх", "ирсэн", "буцаж", "буцах", "өглөө", "орой", "шөнө", "өдөр", "цаг", "минут", "жил", "сар", "хууль", "хуулийн", "хууль зүй", "эрх", "эрх зүй", "эрх зүйн", "эрхтэй", "хэрэг", "хэргийн", "шүүх", "шүүгч", "шийдвэр", "нэхэмжлэл", "хариу", "хариуцлага", "гэмт", "гэмт хэрэг", "гэмт үйлдэл", "баримт", "баримт бичиг", "нотлох", "нотлох баримт", "гэрч", "мэдүүлэг", "өмгөөлөгч", "хохирогч", "шинжилгээ", "шинжлэх", "дүгнэлт", "санал", "гэрээ", "зөрчил", "маргаан", "бодлого", "бодох", "бодож", "заалт", "зүйл", "тогтоол", "ял", "торгууль", "хийх", "хийж", "хийсэн", "өгөх", "авах", "авч", "авсан", "хэлэх", "хэлсэн", "бичих", "бичсэн", "унших", "уншсан", "сурах", "сурсан", "ажиллах", "ажил", "олох", "олсон", "мэдэх", "мэдсэн", "харах", "харсан", "шалгах", "шалгаж", "зөв", "буруу", "сайн", "муу", "их", "бага", "шинэ", "хуучин", "том", "жижиг", "улс", "хот", "аймаг", "сум", "байр", "зам", "гудамж", "нэг", "тав", "зургаа", "долоо", "найм", "ес", "арав", "асуудал", "асуулт", "хариулт", "тайлбар", "жишээ", "утга", "үг", "үгс", "өгүүлбэр", "бичиг", "ном", "сургалт", "сургууль", "багш", "оюутан", "иргэн", "захиргаа", "захиргааны", "иргэний", "эрүүгийн", "мөнгө", "төлбөр", "үнэ", "үнэгүй", "төлбөртэй", "багц", "үйлчилгээ", "систем", "програм", "мэдээлэл", "технологи", "интернет", "файл", "хавсралт", "зан", "зантай", "зангийн", "зангаас", "занд", "яагаад", "яагаадын", "ямар", "ямар нэг", "тийм", "тиймээс", "ингэж", "тэгж", "гэж", "гэжээ", "болох", "болохгүй", "хэрэгтэй", "хэрэггүй", "байдал", "байдлаар", "байдлын", "үндэслэл", "үндэслэлтэй", "шаардлага", "шаардлагатай", "шаардлагагүй", "хамаарах", "хамаарал", "тогтоох", "тогтоосон", "тодорхой", "тодорхойлох", "холбогдох", "холбогдсон", "холбогдогч", "оролцох", "оролцсон", "оролцогч", "прокурор", "прокурорын", "цагдаа", "цагдаагийн", "шүүхийн", "өмгөөлөл", "өмгөөллийн", "яллагч", "улсын", "яллах", "яллах дүгнэлт", "зөрчил гаргагч", "шийтгэл", "албадлага", "албадлагын", "эрх бүхий", "албан тушаалтан", "нотлох баримт", "мэдүүлэг", "магадалгаа", "жолооч", "тээврийн хэрэгсэл", "согтууруулах", "согтолт", "амьсгал", "спирт", "агууламж", "хугацаа", "хэсэг", "заалтын", "дугаар", "оны", "өдрийн", "сарын", "тухайн", "тухай", "дагуу", "дээр", "доор", "дотор", "дараах", "дүгнэж", "үзэх", "үзсэн", "үзнэ", "болно", "зүйтэй", "саналтай", "хэрэгжүүлэх", "хэрэглэсэн", "илэрсэн", "тогтоогдсон", "үндэслэн", "удирдлага", "болгон", "дарааллаар", "улмаар", "иймд", "ингэснээр", "мөн", "бөгөөд", "буюу", "эсхүл", "боловч", "хэрэв", "учир", "учраас", "түүний", "түүнд", "түүнийг", "түүнтэй", "түүнээс", "түүгээр", "түүнийг", "өөрийн", "өөрөө", "өөр", "бүх", "бүгд", "зарим", "хэн", "хэдий", "хэдэн", "хэд", "нөхцөл", "нөхцөл байдал", "үйлдэл", "эс үйлдэхүй", "шинж", "шинжтэй", "объект", "субъект", "санаатай", "болгоомжгүй", "гэм буруу", "гэм буруутай", "хариуцлага", "эрүүгийн хариуцлага", "зөрчлийн хэрэг", "хэрэг хянан шийдвэрлэх", "хянан шийдвэрлэх", "шийдвэрлэх", "шийдвэрлэсэн", "шийдвэрлэж", "хяналтын", "хяналт", "прокурорын газар", "сум дундын", "аймгийн", "Өмнөговь", "Ханбогд", "Цогтцэций", "Монгол Улс", "Монголын", "он", "сар", "өдөр", "№", "РД", "улсын дугаар",
] as const;

const DICTIONARY = new Set<string>();
for (const raw of CORE_DICTIONARY_WORDS) for (const part of raw.split(/\s+/u)) { const normalized = normalizeMongolianWord(part); if (normalized.length >= 2) DICTIONARY.add(normalized); }
for (const stem of ["гэр", "хүн", "хувцас", "хууль", "хэрэг", "баримт", "эрх", "асуудал", "шүүх", "гэрээ", "ажил", "бичиг", "асуулт", "хариулт", "шинжилгээ", "зан", "яагаад", "прокурор", "цагдаа", "жолооч", "тээврийн хэрэгсэл", "шийдвэр"] as const) for (const suffix of ["", "т", "д", "аас", "ээс", "руу", "рүү", "тай", "тэй", "ийн", "ын", "ийг", "ыг", "аар", "ээр", "тайгаа", "тэйгээ", "уудаас", "үүдээс", "уудын", "үүдийн"]) DICTIONARY.add(normalizeMongolianWord(`${stem}${suffix}`));

export function isKnownMongolianWord(word: string): boolean { const normalized = normalizeMongolianWord(word); if (!normalized || normalized.length < 2 || !/[а-яөүё]/u.test(normalized)) return true; return DICTIONARY.has(normalized); }

export function suggestDictionaryWords(word: string, limit = 5, options?: { highConfidenceOnly?: boolean }): readonly string[] {
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2 || DICTIONARY.has(normalized)) return [];
  const mapped = COMMON_TYPO_CORRECTIONS[normalized];
  if (mapped && DICTIONARY.has(mapped)) return [mapped];
  if (options?.highConfidenceOnly) return [];
  const maxDistance = normalized.length <= 4 ? 1 : normalized.length <= 7 ? 2 : 2;
  const scored: Array<{ word: string; distance: number }> = [];
  for (const candidate of DICTIONARY) {
    if (candidate.length < 2 || Math.abs(candidate.length - normalized.length) > maxDistance + 1) continue;
    const distance = spellingDistance(normalized, candidate);
    if (distance <= maxDistance) scored.push({ word: candidate, distance });
  }
  scored.sort((a, b) => a.distance - b.distance || Math.abs(a.word.length - normalized.length) - Math.abs(b.word.length - normalized.length) || a.word.localeCompare(b.word, "mn"));
  return scored.slice(0, limit).map((item) => item.word);
}

export function mongolianRootKey(word: string): string {
  let value = normalizeMongolianWord(word);
  const suffixes = ["уудаасаа", "үүдээсээ", "нуудаас", "нүүдээс", "чуудаас", "чүүдээс", "аасаа", "ээсээ", "тайгаа", "тэйгээ", "уудаар", "үүдээр", "нуудаар", "нүүдээр", "уудын", "үүдийн", "нуудын", "нүүдийн", "уудыг", "үүдийг", "нуудыг", "нүүдийг", "тай", "тэй", "аас", "ээс", "руу", "рүү", "ийн", "ын", "ийг", "ыг", "д", "т", "а", "э", "о", "ө"].sort((a, b) => b.length - a.length);
  for (const suffix of suffixes) if (value.length - suffix.length >= 3 && value.endsWith(suffix)) { value = value.slice(0, -suffix.length); break; }
  return value;
}

export function suggestRootSimilarWords(word: string, limit = 5): readonly string[] {
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2) return [];
  const root = mongolianRootKey(normalized);
  if (root.length < 3) return [];
  const scored: Array<{ word: string; distance: number; rootDistance: number }> = [];
  for (const candidate of DICTIONARY) {
    if (candidate === normalized) continue;
    const candidateRoot = mongolianRootKey(candidate);
    if (candidateRoot.length < 3) continue;
    const rootDistance = spellingDistance(root, candidateRoot);
    const exactRoot = candidateRoot === root;
    const maxRootDistance = root.length <= 4 ? 1 : 2;
    if (!exactRoot && rootDistance > maxRootDistance) continue;
    scored.push({ word: candidate, distance: spellingDistance(normalized, candidate), rootDistance });
  }
  scored.sort((a, b) => Number(a.rootDistance !== 0) - Number(b.rootDistance !== 0) || a.rootDistance - b.rootDistance || a.distance - b.distance || a.word.localeCompare(b.word, "mn"));
  return scored.slice(0, limit).map((item) => item.word);
}

export function dictionarySizeForTests(): number { return DICTIONARY.size; }
