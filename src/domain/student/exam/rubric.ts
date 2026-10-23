import type { ExamProblemKey, Rubric, RubricCriterionId, SelfRatings } from "./types";

/** 0 = not addressed ... 4 = fully addressed. */
export const RATING_MIN = 0;
export const RATING_MAX = 4;

export const RUBRIC_CRITERION_ORDER: readonly RubricCriterionId[] = [
  "issues",
  "law",
  "interpretation",
  "application",
  "counter",
  "conclusion",
];

const DEFAULT_WEIGHTS: Record<RubricCriterionId, number> = {
  issues: 20,
  law: 15,
  interpretation: 20,
  application: 25,
  counter: 10,
  conclusion: 10,
};

/** Default rubric. A reviewer can store a different one per problem; the weights must always add up to 100. */
export function defaultRubric(): Rubric {
  return { criteria: RUBRIC_CRITERION_ORDER.map((id) => ({ id, weight: DEFAULT_WEIGHTS[id] })) };
}

export function isValidRubric(rubric: Rubric): boolean {
  const ids = rubric.criteria.map((c) => c.id);
  return (
    rubric.criteria.length > 0 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => RUBRIC_CRITERION_ORDER.includes(id)) &&
    rubric.criteria.every((c) => Number.isFinite(c.weight) && c.weight > 0) &&
    rubric.criteria.reduce((s, c) => s + c.weight, 0) === 100
  );
}

export type ScoreBreakdown = {
  total: number;
  max: number;
  perCriterion: Array<{ id: RubricCriterionId; weight: number; rating: number; points: number }>;
};

/**
 * Server-side score from self-assessment ratings. Every criterion must be rated with an integer in range, so a client cannot send a
 * score, only ratings; the points are derived here. This is the student's OWN assessment against the rubric, not an examiner's grade.
 */
export function scoreFromRatings(rubric: Rubric, ratings: SelfRatings): ScoreBreakdown | null {
  if (!isValidRubric(rubric)) return null;
  const perCriterion = [];
  let total = 0;
  for (const c of rubric.criteria) {
    const rating = ratings[c.id];
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) return null;
    const points = Math.round(((c.weight * rating) / RATING_MAX) * 100) / 100;
    perCriterion.push({ id: c.id, weight: c.weight, rating, points });
    total += points;
  }
  return { total: Math.round(total * 100) / 100, max: 100, perCriterion };
}

/**
 * Orientation only: which provisions named in the source answer also appear in the student's text. It looks for the article
 * number, so it cannot judge correctness and must never be presented as a score.
 */
export function provisionsMentioned(key: Pick<ExamProblemKey, "legalProvisions">, answerText: string): string[] {
  const text = answerText.replace(/\s+/g, " ");
  const out: string[] = [];
  for (const p of key.legalProvisions) {
    const num = /(\d+(?:\.\d+)*)(?:-р)?\s*(?:дугаар|дүгээр|дүгэр)?\s*зүйл/i.exec(p.text)?.[1];
    if (!num) continue;
    const re = new RegExp(`(?:^|[^\\d.])${num.replace(/\./g, "\\.")}(?:[^\\d]|$)`);
    if (re.test(text) && !out.includes(p.text)) out.push(p.text);
  }
  return out;
}
