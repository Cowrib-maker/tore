"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/application/common/require-actor";
import { lookupAuthSession } from "@/application/common/session";
import {
  browseProblems,
  getAttemptResult,
  getHub,
  getRunnerView,
  openStudy,
  saveAnswer,
  startExam,
  submitAttempt,
  submitSelfAssessment,
  type ExamDeps,
  type StartExamInput,
} from "@/application/student-exam/exam-service";
import { UserRole } from "@/domain/enums";
import { REVIEW_STATUSES, type ReviewStatus } from "@/domain/student/exam/types";
import { studentExamRepository } from "@/infrastructure/repositories/prisma-student-exam-repository";
import { consumeRateLimit, PROFILE_WRITE_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

const deps = (): ExamDeps => ({ studentExamRepository, now: () => new Date(), randomSeed: () => randomUUID() });

type Guard = "unauthenticated" | "rate_limited" | "failed";

/** Identity comes from the server session only; the browser never names a user. */
async function sessionUserId(): Promise<string | null> {
  const { session } = await lookupAuthSession();
  return session?.user?.id ?? null;
}

async function guarded<T>(
  scope: string,
  limit: { limit: number; windowMs: number } | null,
  run: (userId: string) => Promise<T>,
): Promise<T | { ok: false; error: Guard }> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "unauthenticated" };
  try {
    if (limit) {
      const rate = await consumeRateLimit(`student-exam:${scope}:${userId}`, limit.limit, limit.windowMs);
      if (!rate.ok) return { ok: false, error: "rate_limited" };
    }
    return await run(userId);
  } catch (error) {
    console.error(`[student-exam:${scope}] action failed`, error instanceof Error ? error.message : String(error));
    return { ok: false, error: "failed" };
  }
}

// Autosave fires about once a second while typing, so it gets a much larger budget than the one-off actions.
const AUTOSAVE_LIMIT = { limit: 2000, windowMs: 15 * 60 * 1000 };
const WRITE_LIMIT = { limit: PROFILE_WRITE_RATE_LIMIT.limit * 2, windowMs: PROFILE_WRITE_RATE_LIMIT.windowMs };

export async function startExamAction(input: StartExamInput) {
  return guarded("start", WRITE_LIMIT, (userId) => startExam(userId, input, deps()));
}

export async function openStudyAction(problemId: string, fresh: boolean) {
  return guarded("study", WRITE_LIMIT, (userId) =>
    openStudy(userId, typeof problemId === "string" ? problemId : "", { fresh: fresh === true }, deps()),
  );
}

export async function saveAnswerAction(
  attemptId: string,
  payload: { problemId: string; answerText: string; methodChecks?: number[] },
) {
  return guarded("save", AUTOSAVE_LIMIT, (userId) =>
    saveAnswer(userId, String(attemptId), { problemId: payload?.problemId, answerText: payload?.answerText, methodChecks: payload?.methodChecks }, deps()),
  );
}

export async function submitAttemptAction(attemptId: string) {
  return guarded("submit", WRITE_LIMIT, async (userId) => {
    const result = await submitAttempt(userId, String(attemptId), deps());
    revalidatePath("/student/lawyer-exam");
    return result;
  });
}

export async function submitSelfAssessmentAction(attemptId: string, ratings: unknown) {
  return guarded("assess", WRITE_LIMIT, async (userId) => {
    const result = await submitSelfAssessment(userId, String(attemptId), ratings, deps());
    revalidatePath("/student/lawyer-exam");
    return result;
  });
}

// ── loaders for the pages (own data only) ────────────────────────────────────

export async function getRunnerViewForSession(attemptId: string) {
  return guarded("runner", null, (userId) => getRunnerView(userId, attemptId, deps()));
}

export async function getResultForSession(attemptId: string) {
  return guarded("result", null, (userId) => getAttemptResult(userId, attemptId, deps()));
}

export async function getExamHubForSession() {
  return guarded("hub", null, async (userId) => ({ ok: true as const, hub: await getHub(userId, deps()) }));
}

export async function browseProblemsForSession(filter: { area?: string; topic?: string }) {
  return guarded("browse", null, async (userId) => ({ ok: true as const, items: await browseProblems(userId, filter, deps()) }));
}

/** Index of the Supreme Court decision extracts (reference only). */
export async function listCourtDecisionsForSession() {
  return guarded("decisions", null, async () => ({ ok: true as const, items: await studentExamRepository.listCourtDecisions() }));
}

// ── reviewer (admin) ─────────────────────────────────────────────────────────

export async function listProblemsForReviewAction(statuses?: ReviewStatus[]) {
  try {
    await requireActor(UserRole.ADMIN);
    const wanted = (statuses ?? []).filter((s) => (REVIEW_STATUSES as readonly string[]).includes(s));
    return { ok: true as const, items: await studentExamRepository.listForReview(wanted.length ? wanted : undefined) };
  } catch {
    return { ok: false as const, error: "forbidden" as const };
  }
}

export async function setProblemReviewAction(input: {
  problemId: string;
  status: ReviewStatus;
  note?: string;
  topic?: string | null;
  difficulty?: number | null;
}) {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    if (!(REVIEW_STATUSES as readonly string[]).includes(input.status)) return { ok: false as const, error: "invalid" as const };
    if (input.difficulty != null && !(Number.isInteger(input.difficulty) && input.difficulty >= 1 && input.difficulty <= 5)) {
      return { ok: false as const, error: "invalid" as const };
    }
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) || null : null;
    const topic = input.topic === undefined ? undefined : input.topic ? String(input.topic).trim().slice(0, 120) || null : null;
    const updated = await studentExamRepository.setReview(String(input.problemId), {
      status: input.status,
      note,
      reviewerId: actor.userId,
      topic,
      difficulty: input.difficulty,
      at: new Date(),
    });
    revalidatePath("/admin/student-problems");
    return updated ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  } catch {
    return { ok: false as const, error: "forbidden" as const };
  }
}
