import { EXAM_LIMITS } from "./exam-limits";
import type { LockedAttempt, StudentExamRepository } from "@/domain/repositories/student-exam-repository";
import { ConflictError } from "@/domain/errors/domain-error";
import { provisionsMentioned, scoreFromRatings, type ScoreBreakdown } from "@/domain/student/exam/rubric";
import { drawExamProblems } from "@/domain/student/exam/selection";
import {
  ANSWER_MAX_CHARS,
  DEADLINE_GRACE_MS,
  EXAM_AREAS,
  METHOD_STEP_COUNT,
  STUDENT_VISIBLE_STATUSES,
  REVIEW_STATUSES,
  parseExamArea,
  type ExamArea,
  type ExamAttempt,
  type ExamConfig,
  type ExamProblemKey,
  type ExamProblemPublic,
  type SelfRatings,
} from "@/domain/student/exam/types";

export type ExamDeps = {
  studentExamRepository: StudentExamRepository;
  now: () => Date;
  randomSeed: () => string;
};

export { EXAM_LIMITS };

export type Failure<E extends string> = { ok: false; error: E };
const fail = <E extends string>(error: E): Failure<E> => ({ ok: false, error });

const visible = STUDENT_VISIBLE_STATUSES;

// ── lifecycle helpers ─────────────────────────────────────────────────────────

const isPastDeadline = (a: ExamAttempt, now: Date) =>
  a.mode === "EXAM" && a.deadlineAt !== null && now.getTime() > a.deadlineAt.getTime() + DEADLINE_GRACE_MS;

/** Closes an in-progress attempt inside a lock: records the status and the orientation-only indicators from the (server-side) keys. */
async function closeLocked(locked: LockedAttempt, deps: ExamDeps, status: "SUBMITTED" | "EXPIRED", at: Date): Promise<ExamAttempt> {
  const keys = await deps.studentExamRepository.getKeys(locked.attempt.items.map((i) => i.problemId));
  const byId = new Map(keys.map((k) => [k.problemId, k]));
  return locked.update({
    status,
    submittedAt: at,
    items: locked.attempt.items.map((item) => {
      const key = byId.get(item.problemId);
      return {
        problemId: item.problemId,
        autoIndicators: {
          provisionsMentioned: key ? provisionsMentioned(key, item.answerText) : [],
          provisionsExpected: key?.legalProvisions.length ?? 0,
          answerLength: item.answerText.length,
        },
      };
    }),
  });
}

/** Expires an exam whose deadline (plus the autosave grace) has passed. Idempotent and safe to call from any read. */
async function expireIfDue(userId: string, attempt: ExamAttempt, deps: ExamDeps): Promise<ExamAttempt> {
  const now = deps.now();
  if (attempt.status !== "IN_PROGRESS" || !isPastDeadline(attempt, now)) return attempt;
  const closed = await deps.studentExamRepository.withLockedAttempt(attempt.id, userId, async (locked) => {
    if (locked.attempt.status !== "IN_PROGRESS") return locked.attempt;
    return closeLocked(locked, deps, "EXPIRED", locked.attempt.deadlineAt ?? now);
  });
  return closed ?? attempt;
}

// ── starting ──────────────────────────────────────────────────────────────────

export type StartExamInput = {
  areas: unknown;
  count: unknown;
  minutes: unknown;
  areaWeights?: unknown;
  topic?: unknown;
  difficultyMin?: unknown;
  difficultyMax?: unknown;
};

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function validateStartInput(input: StartExamInput): Omit<ExamConfig, "seed"> | null {
  if (!Array.isArray(input.areas) || input.areas.length === 0) return null;
  const areas: ExamArea[] = [];
  for (const a of input.areas) {
    const parsed = parseExamArea(a);
    if (!parsed) return null;
    if (!areas.includes(parsed)) areas.push(parsed);
  }
  if (!isInt(input.count, EXAM_LIMITS.minCount, EXAM_LIMITS.maxCount)) return null;
  if (!isInt(input.minutes, EXAM_LIMITS.minMinutes, EXAM_LIMITS.maxMinutes)) return null;
  const config: Omit<ExamConfig, "seed"> = { areas, count: input.count, minutes: input.minutes };
  if (input.areaWeights && typeof input.areaWeights === "object") {
    const weights: Partial<Record<ExamArea, number>> = {};
    for (const area of EXAM_AREAS) {
      const w = (input.areaWeights as Record<string, unknown>)[area];
      if (w === undefined) continue;
      if (typeof w !== "number" || !Number.isFinite(w) || w <= 0 || w > 10) return null;
      weights[area] = w;
    }
    config.areaWeights = weights;
  }
  if (typeof input.topic === "string" && input.topic.trim()) config.topic = input.topic.trim().slice(0, 120);
  for (const k of ["difficultyMin", "difficultyMax"] as const) {
    const v = input[k];
    if (v === undefined || v === null) continue;
    if (!isInt(v, 1, 5)) return null;
    config[k] = v;
  }
  if (config.difficultyMin !== undefined && config.difficultyMax !== undefined && config.difficultyMin > config.difficultyMax) return null;
  return config;
}

export async function startExam(
  userId: string,
  input: StartExamInput,
  deps: ExamDeps,
): Promise<
  | { ok: true; attemptId: string; resumed: boolean }
  | Failure<"invalid" | "not_enough_problems">
> {
  const repo = deps.studentExamRepository;
  const active = await repo.findActiveExam(userId);
  if (active) {
    const current = await expireIfDue(userId, active, deps);
    if (current.status === "IN_PROGRESS") return { ok: true, attemptId: current.id, resumed: true };
  }

  const base = validateStartInput(input);
  if (!base) return fail("invalid");
  const pool = await repo.listProblems({ areas: base.areas, topic: base.topic ?? null, statuses: visible });
  const config: ExamConfig = { ...base, seed: deps.randomSeed() };
  const drawn = drawExamProblems(pool, config);
  if (drawn.length < config.count) return fail("not_enough_problems");

  const startedAt = deps.now();
  try {
    const attempt = await repo.createAttempt({
      userId,
      mode: "EXAM",
      config,
      studyProblemId: null,
      startedAt,
      deadlineAt: new Date(startedAt.getTime() + config.minutes * 60_000),
      problemIds: drawn.map((p) => p.id),
    });
    return { ok: true, attemptId: attempt.id, resumed: false };
  } catch (error) {
    if (error instanceof ConflictError) {
      // Two starts raced: the database allows one exam in progress, so resume the winner instead of creating a second.
      const winner = await repo.findActiveExam(userId);
      if (winner) return { ok: true, attemptId: winner.id, resumed: true };
    }
    throw error;
  }
}

export async function openStudy(
  userId: string,
  problemId: string,
  options: { fresh?: boolean },
  deps: ExamDeps,
): Promise<{ ok: true; attemptId: string } | Failure<"not_found">> {
  const repo = deps.studentExamRepository;
  const problem = await repo.getProblem(problemId);
  if (!problem || !visible.includes(problem.reviewStatus)) return fail("not_found");
  const active = await repo.findActiveStudy(userId, problemId);
  if (active) return { ok: true, attemptId: active.id };
  if (!options.fresh) {
    const latest = (await repo.listAttempts(userId, 200)).find((a) => a.mode === "STUDY" && a.studyProblemId === problemId);
    if (latest) return { ok: true, attemptId: latest.id };
  }
  try {
    const attempt = await repo.createAttempt({
      userId,
      mode: "STUDY",
      config: null,
      studyProblemId: problemId,
      startedAt: deps.now(),
      deadlineAt: null,
      problemIds: [problemId],
    });
    return { ok: true, attemptId: attempt.id };
  } catch (error) {
    if (error instanceof ConflictError) {
      const winner = await repo.findActiveStudy(userId, problemId);
      if (winner) return { ok: true, attemptId: winner.id };
    }
    throw error;
  }
}

// ── working on an attempt (question payload: never contains a key) ────────────

export type RunnerProblem = ExamProblemPublic & {
  position: number;
  answerText: string;
  methodChecks: number[];
  answerUpdatedAt: string | null;
};

export type RunnerView = {
  attemptId: string;
  mode: "STUDY" | "EXAM";
  status: "IN_PROGRESS";
  /** Server clock at the moment of the response, so the browser can show the remaining time without trusting its own clock. */
  serverNow: string;
  deadlineAt: string | null;
  problems: RunnerProblem[];
};

export async function getRunnerView(
  userId: string,
  attemptId: string,
  deps: ExamDeps,
): Promise<{ ok: true; view: RunnerView } | { ok: true; closed: true; attemptId: string; mode: "STUDY" | "EXAM"; studyProblemId: string | null } | Failure<"not_found">> {
  const repo = deps.studentExamRepository;
  const found = await repo.findAttempt(attemptId, userId);
  if (!found) return fail("not_found");
  const attempt = await expireIfDue(userId, found, deps);
  if (attempt.status !== "IN_PROGRESS") {
    return { ok: true, closed: true, attemptId: attempt.id, mode: attempt.mode, studyProblemId: attempt.studyProblemId };
  }
  const problems = await repo.listProblems({ ids: attempt.items.map((i) => i.problemId), statuses: REVIEW_STATUSES });
  const byId = new Map(problems.map((p) => [p.id, p]));
  const rows: RunnerProblem[] = [];
  for (const item of attempt.items) {
    const p = byId.get(item.problemId);
    if (!p) continue;
    rows.push({
      ...p,
      position: item.position,
      answerText: item.answerText,
      methodChecks: item.methodChecks,
      answerUpdatedAt: item.answerUpdatedAt?.toISOString() ?? null,
    });
  }
  rows.sort((a, b) => a.position - b.position);
  return {
    ok: true,
    view: {
      attemptId: attempt.id,
      mode: attempt.mode,
      status: "IN_PROGRESS",
      serverNow: deps.now().toISOString(),
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      problems: rows,
    },
  };
}

export async function saveAnswer(
  userId: string,
  attemptId: string,
  input: { problemId: unknown; answerText: unknown; methodChecks?: unknown },
  deps: ExamDeps,
): Promise<{ ok: true; savedAt: string } | Failure<"invalid" | "not_found" | "closed" | "expired">> {
  if (typeof input.problemId !== "string" || typeof input.answerText !== "string" || input.answerText.length > ANSWER_MAX_CHARS) {
    return fail("invalid");
  }
  let checks: number[] = [];
  if (input.methodChecks !== undefined) {
    if (!Array.isArray(input.methodChecks) || input.methodChecks.length > METHOD_STEP_COUNT) return fail("invalid");
    for (const c of input.methodChecks) if (!isInt(c, 0, METHOD_STEP_COUNT - 1)) return fail("invalid");
    checks = [...new Set(input.methodChecks as number[])].sort((a, b) => a - b);
  }
  const problemId = input.problemId;
  const answerText = input.answerText;

  const result = await deps.studentExamRepository.withLockedAttempt(attemptId, userId, async (locked) => {
    // Read the clock only once the lock is held: a request that queued behind another must judge the deadline at its own turn.
    const now = deps.now();
    if (locked.attempt.status !== "IN_PROGRESS") return fail("closed");
    if (isPastDeadline(locked.attempt, now)) {
      await closeLocked(locked, deps, "EXPIRED", locked.attempt.deadlineAt ?? now);
      return fail("expired");
    }
    if (!locked.attempt.items.some((i) => i.problemId === problemId)) return fail("not_found");
    await locked.update({ items: [{ problemId, answerText, methodChecks: checks, answerUpdatedAt: now }] });
    return { ok: true as const, savedAt: now.toISOString() };
  });
  return result ?? fail("not_found");
}

export async function submitAttempt(
  userId: string,
  attemptId: string,
  deps: ExamDeps,
): Promise<{ ok: true; status: "SUBMITTED" | "EXPIRED"; alreadyClosed: boolean } | Failure<"not_found">> {
  const result = await deps.studentExamRepository.withLockedAttempt(attemptId, userId, async (locked) => {
    const now = deps.now(); // read under the lock, see saveAnswer
    const current = locked.attempt;
    // A second submit (double click, retry, two tabs) is a no-op that reports the first outcome.
    if (current.status !== "IN_PROGRESS") return { ok: true as const, status: current.status, alreadyClosed: true };
    const late = isPastDeadline(current, now);
    await closeLocked(locked, deps, late ? "EXPIRED" : "SUBMITTED", late ? (current.deadlineAt ?? now) : now);
    return { ok: true as const, status: late ? ("EXPIRED" as const) : ("SUBMITTED" as const), alreadyClosed: false };
  });
  return (result as { ok: true; status: "SUBMITTED" | "EXPIRED"; alreadyClosed: boolean } | null) ?? fail("not_found");
}

// ── self-assessment (the only source of a score) ──────────────────────────────

export async function submitSelfAssessment(
  userId: string,
  attemptId: string,
  ratingsByProblem: unknown,
  deps: ExamDeps,
): Promise<{ ok: true; scoreTotal: number; scoreMax: number } | Failure<"invalid" | "not_found" | "not_closed" | "already_finalized">> {
  if (!ratingsByProblem || typeof ratingsByProblem !== "object") return fail("invalid");
  const now = deps.now();
  const outcome = await deps.studentExamRepository.withLockedAttempt(attemptId, userId, async (locked) => {
    const attempt = locked.attempt;
    if (attempt.status === "IN_PROGRESS") return fail("not_closed");
    if (attempt.finalizedAt) return fail("already_finalized");
    const keys = await deps.studentExamRepository.getKeys(attempt.items.map((i) => i.problemId));
    const byId = new Map(keys.map((k) => [k.problemId, k]));
    const patches = [];
    let total = 0;
    for (const item of attempt.items) {
      const key = byId.get(item.problemId);
      const ratings = (ratingsByProblem as Record<string, SelfRatings>)[item.problemId];
      if (!key || !ratings || typeof ratings !== "object") return fail("invalid");
      const breakdown = scoreFromRatings(key.rubric, ratings);
      if (!breakdown) return fail("invalid");
      total += breakdown.total;
      patches.push({ problemId: item.problemId, selfRatings: ratings, scoreAwarded: breakdown.total, scoreMax: breakdown.max });
    }
    const scoreMax = attempt.items.length * 100;
    await locked.update({ items: patches, finalizedAt: now, scoreTotal: Math.round(total * 100) / 100, scoreMax });
    return { ok: true as const, scoreTotal: Math.round(total * 100) / 100, scoreMax };
  });
  return (outcome as { ok: true; scoreTotal: number; scoreMax: number } | Failure<"invalid" | "not_closed" | "already_finalized"> | null) ?? fail("not_found");
}

// ── result (the ONLY place a key leaves the server) ───────────────────────────

export type ResultItem = {
  problem: ExamProblemPublic;
  key: Pick<ExamProblemKey, "modelAnswer" | "answerOutline" | "legalProvisions" | "courtCitations" | "rubric" | "provenance">;
  answerText: string;
  methodChecks: number[];
  selfRatings: SelfRatings | null;
  breakdown: ScoreBreakdown | null;
  autoIndicators: ExamAttempt["items"][number]["autoIndicators"];
};

export type AttemptResult = {
  attemptId: string;
  mode: "STUDY" | "EXAM";
  status: "SUBMITTED" | "EXPIRED";
  startedAt: string;
  submittedAt: string | null;
  finalized: boolean;
  scoreTotal: number | null;
  scoreMax: number | null;
  items: ResultItem[];
  /** Mean rating (0-4) per criterion over the assessed problems; lowest first. Drives "what to improve". */
  weakCriteria: Array<{ id: string; average: number }>;
  /** Problems worth re-solving: lowest self-assessed score first (only after finalisation). */
  retryProblemIds: string[];
  /** Compared with the previous finalised attempt of the same mode. */
  previous: { attemptId: string; percent: number; deltaPercent: number } | null;
};

const percentOf = (a: ExamAttempt) => (a.scoreTotal !== null && a.scoreMax ? Math.round((a.scoreTotal / a.scoreMax) * 1000) / 10 : null);

export async function getAttemptResult(
  userId: string,
  attemptId: string,
  deps: ExamDeps,
): Promise<{ ok: true; result: AttemptResult } | Failure<"not_found" | "in_progress">> {
  const repo = deps.studentExamRepository;
  const found = await repo.findAttempt(attemptId, userId);
  if (!found) return fail("not_found");
  const attempt = await expireIfDue(userId, found, deps);
  if (attempt.status === "IN_PROGRESS") return fail("in_progress");

  const ids = attempt.items.map((i) => i.problemId);
  const [problems, keys] = await Promise.all([
    repo.listProblems({ ids, statuses: REVIEW_STATUSES }),
    repo.getKeys(ids),
  ]);
  const pById = new Map(problems.map((p) => [p.id, p]));
  const kById = new Map(keys.map((k) => [k.problemId, k]));

  const items: ResultItem[] = [];
  for (const item of [...attempt.items].sort((a, b) => a.position - b.position)) {
    const problem = pById.get(item.problemId);
    const key = kById.get(item.problemId);
    if (!problem || !key) continue;
    items.push({
      problem,
      key: {
        modelAnswer: key.modelAnswer,
        answerOutline: key.answerOutline,
        legalProvisions: key.legalProvisions,
        courtCitations: key.courtCitations,
        rubric: key.rubric,
        provenance: key.provenance,
      },
      answerText: item.answerText,
      methodChecks: item.methodChecks,
      selfRatings: item.selfRatings,
      breakdown: item.selfRatings ? scoreFromRatings(key.rubric, item.selfRatings) : null,
      autoIndicators: item.autoIndicators,
    });
  }

  const sums = new Map<string, { total: number; n: number }>();
  for (const it of items) {
    for (const c of it.breakdown?.perCriterion ?? []) {
      const s = sums.get(c.id) ?? { total: 0, n: 0 };
      s.total += c.rating;
      s.n += 1;
      sums.set(c.id, s);
    }
  }
  const weakCriteria = [...sums.entries()]
    .map(([id, s]) => ({ id, average: Math.round((s.total / s.n) * 100) / 100 }))
    .sort((a, b) => a.average - b.average);
  const retryProblemIds = items
    .filter((i) => i.breakdown)
    .sort((a, b) => a.breakdown!.total - b.breakdown!.total)
    .slice(0, 3)
    .map((i) => i.problem.id);

  let previous: AttemptResult["previous"] = null;
  const current = percentOf(attempt);
  if (current !== null) {
    const earlier = (await repo.listAttempts(userId, 200)).find(
      (a) => a.id !== attempt.id && a.mode === attempt.mode && a.finalizedAt && a.startedAt.getTime() < attempt.startedAt.getTime(),
    );
    const prevPercent = earlier ? percentOf(earlier) : null;
    if (earlier && prevPercent !== null) {
      previous = { attemptId: earlier.id, percent: prevPercent, deltaPercent: Math.round((current - prevPercent) * 10) / 10 };
    }
  }

  return {
    ok: true,
    result: {
      attemptId: attempt.id,
      mode: attempt.mode,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      finalized: attempt.finalizedAt !== null,
      scoreTotal: attempt.scoreTotal,
      scoreMax: attempt.scoreMax,
      items,
      weakCriteria,
      retryProblemIds,
      previous,
    },
  };
}

// ── hub / browse ──────────────────────────────────────────────────────────────

export async function getHub(userId: string, deps: ExamDeps) {
  const repo = deps.studentExamRepository;
  const [counts, topics, active, recent] = await Promise.all([
    repo.countByArea(visible),
    repo.listTopics(visible),
    repo.findActiveExam(userId),
    repo.listAttempts(userId, 20),
  ]);
  const liveActive = active ? await expireIfDue(userId, active, deps) : null;
  return {
    counts,
    topics,
    activeExamId: liveActive && liveActive.status === "IN_PROGRESS" ? liveActive.id : null,
    history: recent
      .filter((a) => a.mode === "EXAM" || a.status !== "IN_PROGRESS")
      .map((a) => ({
        id: a.id,
        mode: a.mode,
        status: a.status,
        startedAt: a.startedAt.toISOString(),
        problems: a.items.length,
        percent: percentOf(a),
      })),
  };
}

export async function browseProblems(
  userId: string,
  filter: { area?: unknown; topic?: unknown },
  deps: ExamDeps,
) {
  const repo = deps.studentExamRepository;
  const area = parseExamArea(filter.area);
  const topic = typeof filter.topic === "string" && filter.topic.trim() ? filter.topic.trim() : null;
  const [problems, attempts] = await Promise.all([
    repo.listProblems({ areas: area ? [area] : undefined, topic, statuses: visible }),
    repo.listAttempts(userId, 200),
  ]);
  const studied = new Set(attempts.filter((a) => a.mode === "STUDY" && a.status !== "IN_PROGRESS" && a.studyProblemId).map((a) => a.studyProblemId!));
  const started = new Set(attempts.filter((a) => a.mode === "STUDY" && a.status === "IN_PROGRESS" && a.studyProblemId).map((a) => a.studyProblemId!));
  return problems.map((p) => ({ problem: p, studied: studied.has(p.id), inProgress: started.has(p.id) }));
}
