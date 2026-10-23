import { createHash } from "node:crypto";

import type { ExamArea, ExamConfig, ExamProblemPublic } from "./types";

/** Deterministic PRNG (mulberry32) seeded from a string, so a recorded seed reproduces the exact draw. */
export function seededRandom(seed: string): () => number {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws `config.count` distinct problems from the eligible pool.
 *  - eligibility: requested areas, optional topic, difficulty window (unrated problems stay eligible);
 *  - area weights bias the draw (weighted sampling without replacement, Efraimidis-Spirakis keys).
 * Returns fewer than `count` only when the pool is smaller; the caller decides whether that is acceptable.
 */
export function drawExamProblems(pool: readonly ExamProblemPublic[], config: ExamConfig): ExamProblemPublic[] {
  const eligible = pool.filter((p) => {
    if (!config.areas.includes(p.area)) return false;
    if (config.topic && p.topic !== config.topic) return false;
    if (p.difficulty !== null) {
      if (config.difficultyMin !== undefined && p.difficulty < config.difficultyMin) return false;
      if (config.difficultyMax !== undefined && p.difficulty > config.difficultyMax) return false;
    }
    return true;
  });
  const random = seededRandom(config.seed);
  const weightOf = (area: ExamArea) => {
    const w = config.areaWeights?.[area];
    return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 1;
  };
  return eligible
    .map((p) => ({ p, key: Math.pow(random() || Number.MIN_VALUE, 1 / weightOf(p.area)) }))
    .sort((x, y) => y.key - x.key || x.p.id.localeCompare(y.p.id))
    .slice(0, Math.max(0, config.count))
    .map((x) => x.p);
}
