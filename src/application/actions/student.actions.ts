"use server";

import { z } from "zod";

import { gradeStudentQuizUseCase } from "@/application/use-cases/student/grade-quiz";
import {
  evaluateStudentProblemUseCase,
  STUDENT_PROBLEM_ANSWER_MAX_CHARS,
} from "@/application/use-cases/student/evaluate-student-problem";
import type { StudentProblemGrade, StudentQuizGrade } from "@/domain/student";
import { getClientIp } from "@/application/common/client-ip";
import { STUDENT_PROBLEM_EVALUATION_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";
import { consumeRateLimit } from "@/infrastructure/security/rate-limiter";

const payloadSchema = z.object({
  quizId: z.string().min(1).max(80),
  answers: z.record(z.string().max(8)),
});

export async function gradeStudentQuizAction(input: {
  quizId: string;
  answers: Record<string, string>;
}): Promise<StudentQuizGrade | { error: string }> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }
  const result = gradeStudentQuizUseCase(parsed.data.quizId, parsed.data.answers);
  if ("error" in result) {
    return { error: "not_found" };
  }
  return result;
}

const problemPayloadSchema = z.object({
  problemId: z.string().min(1).max(80),
  answer: z.string().min(1).max(STUDENT_PROBLEM_ANSWER_MAX_CHARS),
});

/**
 * Unauthenticated (Student track has no login wall) and each call can
 * trigger a real AI grading request, so this is rate-limited per IP —
 * see STUDENT_PROBLEM_EVALUATION_RATE_LIMIT for why.
 */
export async function evaluateStudentProblemAction(input: {
  problemId: string;
  answer: string;
}): Promise<StudentProblemGrade | { error: string }> {
  const parsed = problemPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }

  const ipAddress = await getClientIp();
  const rate = await consumeRateLimit(
    `student-problem:${ipAddress ?? "unknown"}`,
    STUDENT_PROBLEM_EVALUATION_RATE_LIMIT.limit,
    STUDENT_PROBLEM_EVALUATION_RATE_LIMIT.windowMs,
  );
  if (!rate.ok) {
    return { error: "rate_limited" };
  }

  const result = await evaluateStudentProblemUseCase(parsed.data.problemId, parsed.data.answer);
  if ("error" in result) {
    return { error: result.error };
  }
  return result;
}
