import { findWrittenExamProblemById } from "@/domain/student/written-exam-problems";
import type { WrittenExamAttempt, WrittenExamProblem } from "@/domain/student/written-exam-types";
import type { StudentAttemptRepository } from "@/domain/repositories/student-attempt-repository";
import { studentAttemptRepository } from "@/infrastructure/repositories";

export type WrittenExamPageState = {
  problem: WrittenExamProblem;
  attempt: WrittenExamAttempt | null;
};

export async function getWrittenExamPageStateUseCase(
  input: { problemId: string; guestSessionId: string },
  deps: { repository?: StudentAttemptRepository } = {},
): Promise<WrittenExamPageState | { error: "not_found" }> {
  const problem = findWrittenExamProblemById(input.problemId.trim());
  if (!problem) {
    return { error: "not_found" };
  }
  const repository = deps.repository ?? studentAttemptRepository;
  const attempt = await repository.findLatestByProblem(problem.id, input.guestSessionId);
  return { problem, attempt };
}
