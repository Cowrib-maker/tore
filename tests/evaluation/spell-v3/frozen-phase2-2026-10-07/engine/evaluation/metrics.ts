/** Pure evaluation helpers (dependency-free; used by the benchmark and tests). */

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export type Confusion = { tp: number; fp: number; fn: number; tn: number };

export function precision(c: Confusion): number {
  return c.tp + c.fp === 0 ? 1 : c.tp / (c.tp + c.fp);
}
export function recall(c: Confusion): number {
  return c.tp + c.fn === 0 ? 1 : c.tp / (c.tp + c.fn);
}
/** F-beta; beta=0.5 weights precision twice as much as recall. */
export function fBeta(c: Confusion, beta = 0.5): number {
  const p = precision(c);
  const r = recall(c);
  if (p === 0 && r === 0) return 0;
  const b2 = beta * beta;
  return ((1 + b2) * p * r) / (b2 * p + r);
}

export function topK(ranks: readonly (number | null)[], k: number): number {
  if (ranks.length === 0) return 0;
  return ranks.filter((r) => r !== null && r <= k).length / ranks.length;
}
/** Mean reciprocal rank; `null` = correct answer not suggested. */
export function mrr(ranks: readonly (number | null)[]): number {
  if (ranks.length === 0) return 0;
  return ranks.reduce<number>((s, r) => s + (r === null ? 0 : 1 / r), 0) / ranks.length;
}

/** Deterministic PRNG so synthetic benchmarks are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ErrorKind = "DELETE" | "TRANSPOSE" | "VOWEL_SWAP" | "DOUBLE_FINAL" | "INSERT" | "HARMONY_SUFFIX_SWAP";

const VOWEL_SWAPS: Record<string, string> = { о: "ө", ө: "о", у: "ү", ү: "у", а: "э", э: "а", и: "ы", ы: "и" };
const SUFFIX_SWAPS: ReadonlyArray<readonly [string, string]> = [
  ["аас", "ээс"],
  ["ээс", "аас"],
  ["тай", "тэй"],
  ["тэй", "тай"],
  ["ын", "ийн"],
  ["ийн", "ын"],
];

/** Inject one seeded error. Returns null when the kind is not applicable. */
export function injectError(word: string, kind: ErrorKind, rng: () => number): string | null {
  const n = word.length;
  if (n < 4) return null;
  switch (kind) {
    case "DELETE": {
      const i = 1 + Math.floor(rng() * (n - 2));
      return word.slice(0, i) + word.slice(i + 1);
    }
    case "INSERT": {
      const i = 1 + Math.floor(rng() * (n - 2));
      return word.slice(0, i) + word[i] + word.slice(i);
    }
    case "TRANSPOSE": {
      const i = 1 + Math.floor(rng() * (n - 3));
      if (word[i] === word[i + 1]) return null;
      return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    }
    case "VOWEL_SWAP": {
      const spots = [...word].map((c, i) => (VOWEL_SWAPS[c] ? i : -1)).filter((i) => i > 0);
      if (spots.length === 0) return null;
      const i = spots[Math.floor(rng() * spots.length)]!;
      return word.slice(0, i) + VOWEL_SWAPS[word[i]!] + word.slice(i + 1);
    }
    case "DOUBLE_FINAL": {
      return /[бвгджзклмнпрстфхцчшщ]$/u.test(word) ? word + word[n - 1] : null;
    }
    case "HARMONY_SUFFIX_SWAP": {
      for (const [from, to] of SUFFIX_SWAPS) if (word.endsWith(from)) return word.slice(0, -from.length) + to;
      return null;
    }
  }
}
