import errorModel from "../data/models/error-model.json";

const C = errorModel.costs;
const SUBS = errorModel.substitutions as Record<string, number>;
export const ERROR_MODEL_VERSION: string = errorModel.version;

const VOWELS = new Set("аэиоуөүяеёюый");
const isV = (c: string | undefined) => c !== undefined && VOWELS.has(c);

/** Cost of deleting a[i] (the user typed an EXTRA letter). Context decides how plausible the slip is. */
function delCost(a: string, i: number): number {
  const c = a[i]!;
  if (c === a[i - 1] || c === a[i + 1]) return C.DELETE_DOUBLED; // a repeated letter is a very common slip
  if (isV(c)) return C.DELETE_VOWEL;
  return C.DELETE;
}

/** Cost of inserting b[j] (the user DROPPED a letter): vowels in consonant clusters and doubled vowels are the usual casualties. */
function insCost(b: string, j: number): number {
  const c = b[j]!;
  if (c === b[j - 1] || c === b[j + 1]) return isV(c) ? C.INSERT_DUPLICATE_VOWEL : C.INSERT_DUPLICATE_CONSONANT;
  if (isV(c) && !isV(b[j - 1]) && !isV(b[j + 1])) return C.INSERT_VOWEL_IN_CLUSTER;
  return C.INSERT;
}

/**
 * Weighted edit cost between a misspelling and a candidate (data: models/error-model.json).
 * No statistical model, no LLM: explainable costs that encode which slips real Mongolian writers make
 * (о↔ө, у↔ү, doubled letters, dropped vowels in clusters) versus implausible ones. Lower is closer.
 */
export function editCost(wrong: string, right: string): number {
  const a = wrong;
  const b = right;
  const la = a.length;
  const lb = b.length;
  const d: number[][] = Array.from({ length: la + 1 }, () => new Array<number>(lb + 1).fill(0));
  for (let i = 1; i <= la; i += 1) d[i]![0] = d[i - 1]![0]! + delCost(a, i - 1);
  for (let j = 1; j <= lb; j += 1) d[0]![j] = d[0]![j - 1]! + insCost(b, j - 1);
  for (let i = 1; i <= la; i += 1) {
    for (let j = 1; j <= lb; j += 1) {
      const x = a[i - 1]!;
      const y = b[j - 1]!;
      const sub = x === y ? 0 : substitutionCost(x, y);
      let v = Math.min(d[i - 1]![j]! + delCost(a, i - 1), d[i]![j - 1]! + insCost(b, j - 1), d[i - 1]![j - 1]! + sub);
      if (i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y) v = Math.min(v, d[i - 2]![j - 2]! + C.TRANSPOSE);
      d[i]![j] = v;
    }
  }
  return d[la]![lb]!;
}

function substitutionCost(x: string, y: string): number {
  const pair = SUBS[x + y] ?? SUBS[y + x];
  if (pair !== undefined) return pair;
  const vx = isV(x);
  const vy = isV(y);
  if (vx && vy) return C.SUBSTITUTE_VOWEL;
  if (!vx && !vy) return C.SUBSTITUTE_CONSONANT;
  return C.SUBSTITUTE_OTHER;
}

export type RankInput = {
  text: string;
  freq: number;
  /** 0 = GENERAL, 1 = LEGAL / others. */
  layerRank: number;
};

export type Ranked = { text: string; cost: number; score: number };

/**
 * Rank candidates for a misspelling. Score is cost-dominated; frequency and
 * layer only break near-ties (they can never overturn a one-edit difference).
 */
export function rankCandidates(wrong: string, candidates: readonly RankInput[]): Ranked[] {
  return candidates
    .map((c) => {
      const cost = editCost(wrong, c.text);
      const freqBonus = Math.min(0.2, Math.log10(1 + Math.max(0, c.freq)) * 0.05);
      const layerPenalty = c.layerRank * 0.03;
      const firstLetterPenalty = wrong[0] === c.text[0] ? 0 : 0.25;
      return { text: c.text, cost, score: cost - freqBonus + layerPenalty + firstLetterPenalty };
    })
    .sort((p, q) => p.score - q.score || p.text.localeCompare(q.text, "mn"));
}
