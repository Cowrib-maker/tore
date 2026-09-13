import { CONSONANT_LETTERS, VOWEL_LETTERS } from "@/domain/mongolian-orthography/engine";

/** Levenshtein distance for Mongolian Cyrillic spell suggestions. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i += 1) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

function letterCategory(ch: string): "vowel" | "consonant" | "other" {
  if (VOWEL_LETTERS.has(ch)) return "vowel";
  if (CONSONANT_LETTERS.has(ch)) return "consonant";
  return "other";
}

/**
 * Levenshtein distance with a cheaper substitution cost (0.7) when both
 * letters are in the same phonetic category (vowel↔vowel or
 * consonant↔consonant) — a same-category slip ("ширэх"→"шарэх") is a more
 * plausible single typo than a cross-category one, so it should score as
 * a closer match. Insertions/deletions and cross-category substitutions
 * keep the standard cost of 1. Used only for candidate ranking; exact
 * dictionary/typo-map matching still uses the unweighted distance above.
 */
export function weightedLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i += 1) matrix[i]![0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const ca = a[i - 1]!;
      const cb = b[j - 1]!;
      let subCost = 1;
      if (ca === cb) {
        subCost = 0;
      } else {
        const catA = letterCategory(ca);
        const catB = letterCategory(cb);
        if (catA === catB && catA !== "other") subCost = 0.7;
      }
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + subCost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}
