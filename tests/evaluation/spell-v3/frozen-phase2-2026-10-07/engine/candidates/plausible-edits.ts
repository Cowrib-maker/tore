/**
 * Error-model candidate generation: only the slips Mongolian writers actually
 * make, not every string within edit distance 1 (that is ~35·2n strings, and
 * almost all of them are noise). Each candidate is later verified against a
 * validity oracle, so a wrong guess costs time, never correctness.
 *
 *  - delete a letter (an extra/duplicated letter: хамтт → хамт)
 *  - transpose neighbours
 *  - substitute within a confusable class: vowels (о/ө, у/ү, а/э, и/ы/й, я/е …),
 *    voiced/voiceless pairs (д/т, г/х, б/п, з/с, ц/ч, ш/с)
 *  - insert a vowel where consonants cluster (хэрг → хэрэг) or duplicate a
 *    neighbouring vowel (маргаш → маргааш)
 *  - insert ANY letter (a dropped letter: хэлцл → хэлэлцэл is not edit-1, but
 *    бичг → бичиг and сайхн → сайхан are)
 */
const ALPHABET = "абвгдеёжзийклмнопрстуфхцчшщъыьэюяөү";
const VOWELS = "аэиоуөүяеёюый";
const CONSONANT_CLASSES: Record<string, string> = {
  д: "т",
  т: "д",
  г: "хк",
  х: "г",
  к: "г",
  б: "пв",
  п: "б",
  в: "б",
  з: "сж",
  с: "зш",
  ж: "з",
  ц: "ч",
  ч: "цш",
  ш: "сч",
};
const VOWEL_SET = new Set(VOWELS);

export function plausibleEdits(word: string): string[] {
  const out = new Set<string>();
  const n = word.length;
  for (let i = 0; i < n; i += 1) {
    const c = word[i]!;
    out.add(word.slice(0, i) + word.slice(i + 1));
    if (i + 1 < n && c !== word[i + 1]) out.add(word.slice(0, i) + word[i + 1] + c + word.slice(i + 2));
    if (VOWEL_SET.has(c)) {
      for (const v of VOWELS) if (v !== c) out.add(word.slice(0, i) + v + word.slice(i + 1));
    } else {
      for (const k of CONSONANT_CLASSES[c] ?? "") out.add(word.slice(0, i) + k + word.slice(i + 1));
    }
  }
  for (let i = 1; i <= n; i += 1) for (const c of ALPHABET) out.add(word.slice(0, i) + c + word.slice(i));
  for (let i = 0; i <= n; i += 1) {
    const prev = word[i - 1];
    const next = word[i];
    const cluster = prev !== undefined && !VOWEL_SET.has(prev) && (next === undefined || !VOWEL_SET.has(next));
    if (cluster) for (const v of VOWELS) out.add(word.slice(0, i) + v + word.slice(i));
    // duplicated vowel (аа, ээ, ий …) and doubled consonant restore
    if (prev !== undefined && VOWEL_SET.has(prev)) out.add(word.slice(0, i) + prev + word.slice(i));
    if (next !== undefined && VOWEL_SET.has(next)) out.add(word.slice(0, i) + next + word.slice(i));
  }
  out.delete(word);
  out.delete("");
  return [...out];
}
