/**
 * Normalisation of a single surface token for lexicon lookup.
 *
 * Offsets are NEVER computed on normalised text: the lexer works on the
 * original string, and normalisation is applied per token afterwards, so a
 * suggestion's range always points at the user's real characters.
 */

const CYRILLIC = /[Ѐ-ӿ]/u;
const LATIN = /[A-Za-z]/u;

export function hasCyrillic(text: string): boolean {
  return CYRILLIC.test(text);
}

export function hasLatin(text: string): boolean {
  return LATIN.test(text);
}

export function normalizeToken(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[’ʼ`´]/gu, "'")
    .toLowerCase()
    .replace(/^['\-]+|['\-]+$/gu, "");
}

/**
 * Latin letters that are visually identical to Cyrillic ones and are commonly
 * produced by keyboard-layout slips. Used ONLY by the MIXED_SCRIPT rule, and
 * only when the repaired word is itself valid.
 */
export const LATIN_TO_CYRILLIC_LOOKALIKE: Readonly<Record<string, string>> = {
  a: "а",
  c: "с",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  A: "А",
  B: "В",
  C: "С",
  E: "Е",
  H: "Н",
  K: "К",
  M: "М",
  O: "О",
  P: "Р",
  T: "Т",
  X: "Х",
  Y: "У",
};
