import { VOWEL_PAIR_COST } from "./confusion";

/**
 * Weighted edit cost between a misspelling and a candidate. No statistical
 * model, no LLM: cheap, explainable costs that encode which slips real
 * Mongolian writers make (о↔ө, у↔ү, same-class letters) versus implausible
 * ones. Lower is closer.
 */
export function editCost(wrong: string, right: string): number {
  const a = wrong;
  const b = right;
  const la = a.length;
  const lb = b.length;
  const d: number[][] = Array.from({ length: la + 1 }, () => new Array<number>(lb + 1).fill(0));
  for (let i = 0; i <= la; i += 1) d[i]![0] = i;
  for (let j = 0; j <= lb; j += 1) d[0]![j] = j;
  for (let i = 1; i <= la; i += 1) {
    for (let j = 1; j <= lb; j += 1) {
      const x = a[i - 1]!;
      const y = b[j - 1]!;
      const sub = x === y ? 0 : substitutionCost(x, y);
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + sub);
      if (i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y) v = Math.min(v, d[i - 2]![j - 2]! + 0.8);
      d[i]![j] = v;
    }
  }
  return d[la]![lb]!;
}

const VOWELS = new Set("аэиоуөүяеёюый");

function substitutionCost(x: string, y: string): number {
  const pair = VOWEL_PAIR_COST[x + y] ?? VOWEL_PAIR_COST[y + x];
  if (pair !== undefined) return pair;
  const vx = VOWELS.has(x);
  const vy = VOWELS.has(y);
  if (vx && vy) return 0.7;
  if (!vx && !vy) return 0.8;
  return 1;
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
