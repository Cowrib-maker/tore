"use server";

import { z } from "zod";

import { submitWrittenAttemptUseCase } from "@/application/use-cases/student/submit-written-attempt";
import { WRITTEN_EXAM_ANSWER_MAX_CHARS } from "@/domain/student/written-exam-validation";
import { requestAttemptHintUseCase } from "@/application/use-cases/student/request-attempt-hint";
import { getWrittenExamPageStateUseCase } from "@/application/use-cases/student/get-attempt-history";
import { resolveGuestSession } from "@/application/legal-ai/resolve-guest-session";
import { getClientIp } from "@/application/common/client-ip";
import {
  consumeRateLimit,
  WRITTEN_EXAM_HINT_RATE_LIMIT,
  WRITTEN_EXAM_SUBMIT_RATE_LIMIT,
} from "@/infrastructure/security/rate-limiter";
import type { Hint, WrittenExamAttempt } from "@/domain/student/written-exam-types";
import type { WrittenExamPageState } from "@/application/use-cases/student/get-attempt-history";

const submitPayloadSchema = z.object({
  problemId: z.string().min(1).max(120),
  answer: z.string().min(1).max(WRITTEN_EXAM_ANSWER_MAX_CHARS),
  attemptId: z.string().min(1).max(80).optional(),
});

/**
 * Unauthenticated (Student track has no login wall) and each submission
 * runs two AI calls (fact/element mapper + tutor narrative), so this is
 * rate-limited per IP the same way evaluateStudentProblemAction is.
 */
export async function submitWrittenAttemptAction(input: {
  problemId: string;
  answer: string;
  attemptId?: string;
}): Promise<WrittenExamAttempt | { error: string }> {
  const parsed = submitPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }

  const ipAddress = await getClientIp();
  const rate = await consumeRateLimit(
    `written-exam-submit:${ipAddress ?? "unknown"}`,
    WRITTEN_EXAM_SUBMIT_RATE_LIMIT.limit,
    WRITTEN_EXAM_SUBMIT_RATE_LIMIT.windowMs,
  );
  if (!rate.ok) {
    return { error: "rate_limited" };
  }

  const guestSession = await resolveGuestSession();
  if (!guestSession) {
    return { error: "no_session" };
  }

  const result = await submitWrittenAttemptUseCase({
    problemId: parsed.data.problemId,
    answer: parsed.data.answer,
    attemptId: parsed.data.attemptId,
    guestSessionId: guestSession.id,
  });
  return result;
}

const hintPayloadSchema = z.object({
  attemptId: z.string().min(1).max(80),
});

export async function requestAttemptHintAction(input: {
  attemptId: string;
}): Promise<Hint | { error: string }> {
  const parsed = hintPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }

  const ipAddress = await getClientIp();
  const rate = await consumeRateLimit(
    `written-exam-hint:${ipAddress ?? "unknown"}`,
    WRITTEN_EXAM_HINT_RATE_LIMIT.limit,
    WRITTEN_EXAM_HINT_RATE_LIMIT.windowMs,
  );
  if (!rate.ok) {
    return { error: "rate_limited" };
  }

  const guestSession = await resolveGuestSession();

if (!guestSession) {
  return { error: "no_session" };
}

return requestAttemptHintUseCase({
  attemptId: parsed.data.attemptId,
  guestSessionId: guestSession.id,
});
}

const pageStatePayloadSchema = z.object({
  problemId: z.string().min(1).max(120),
});

export async function getWrittenExamPageStateAction(input: {
  problemId: string;
}): Promise<WrittenExamPageState | { error: string }> {
  const parsed = pageStatePayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }

  const guestSession = await resolveGuestSession();
  if (!guestSession) {
    return { error: "no_session" };
  }

  return getWrittenExamPageStateUseCase({
    problemId: parsed.data.problemId,
    guestSessionId: guestSession.id,
  });
}
