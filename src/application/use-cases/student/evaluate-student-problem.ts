import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import {
  createStudentProblemEvaluator,
  evaluateStudentProblem,
} from "@/application/ai/student-problem-evaluator";
import { findStudentLegalProblemById } from "@/domain/student/legal-problems";
import type { StudentProblemGrade } from "@/domain/student/types";

export const STUDENT_PROBLEM_ANSWER_MIN_CHARS = 60;
export const STUDENT_PROBLEM_ANSWER_MAX_CHARS = 6_000;

export type EvaluateStudentProblemError =
  | "not_found"
  | "too_short"
  | "too_long";

/**
 * Validate -> grade. Always resolves to real feedback: the AI attempt
 * (`evaluateStudentProblem`) already falls back to the structural checker
 * internally on any failure, so this use case never needs its own
 * AI-specific error branch.
 */
export async function evaluateStudentProblemUseCase(
  problemId: string,
  answer: string,
  deps: { completion?: LegalAiCompletionPort } = {},
): Promise<StudentProblemGrade | { error: EvaluateStudentProblemError }> {
  const problem = findStudentLegalProblemById(problemId.trim());
  if (!problem) {
    return { error: "not_found" };
  }

  const trimmed = answer.trim();
  if (trimmed.length < STUDENT_PROBLEM_ANSWER_MIN_CHARS) {
    return { error: "too_short" };
  }
  if (trimmed.length > STUDENT_PROBLEM_ANSWER_MAX_CHARS) {
    return { error: "too_long" };
  }

  const completion = deps.completion ?? createStudentProblemEvaluator();
  return evaluateStudentProblem(problem, trimmed, completion);
}
