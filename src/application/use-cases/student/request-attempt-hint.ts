import { deriveNextHint } from "@/domain/student/hint-derivation";
import { findWrittenExamProblemById } from "@/domain/student/written-exam-problems";
import type { Hint } from "@/domain/student/written-exam-types";
import type { StudentAttemptRepository } from "@/domain/repositories/student-attempt-repository";
import { studentAttemptRepository } from "@/infrastructure/repositories";

export type RequestAttemptHintError =
  | "not_found"
  | "no_attempt_yet"
  | "no_hint_available";

export async function requestAttemptHintUseCase(
  input: { attemptId: string; guestSessionId: string },
  deps: { repository?: StudentAttemptRepository } = {},
): Promise<Hint | { error: RequestAttemptHintError }> {
  const repository = deps.repository ?? studentAttemptRepository;

  const attempt = await repository.findById(
    input.attemptId,
    input.guestSessionId,
  );

  if (!attempt) {
    return { error: "not_found" };
  }

  const latestRevision = attempt.answerHistory[attempt.answerHistory.length - 1];

  if (!latestRevision) {
    return { error: "no_attempt_yet" };
  }

  const problem = findWrittenExamProblemById(attempt.problemId);

  if (!problem) {
    return { error: "not_found" };
  }

  const hint = deriveNextHint(
    problem.rubric,
    latestRevision.evaluation.elementFeedback,
    attempt.hintsRevealed,
  );

  if (!hint) {
    return { error: "no_hint_available" };
  }

  await repository.appendRevision({
    id: attempt.id,
    guestSessionId: input.guestSessionId,
    hint,
  });

  return hint;
}