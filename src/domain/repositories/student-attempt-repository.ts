import type { WrittenExamAttempt } from "@/domain/student/written-exam-types";

export type CreateStudentAttemptInput = {
  problemId: string;
  trackId: string;
  guestSessionId: string | null;
};

export type AppendStudentAttemptRevisionInput = {
  id: string;
  guestSessionId: string;
  revision?: WrittenExamAttempt["answerHistory"][number];
  hint?: WrittenExamAttempt["hintsRevealed"][number];
  status?: WrittenExamAttempt["status"];
  finalGrade?: WrittenExamAttempt["finalGrade"];
};

export interface StudentAttemptRepository {
  create(input: CreateStudentAttemptInput): Promise<WrittenExamAttempt>;

  findById(
    id: string,
    guestSessionId: string,
  ): Promise<WrittenExamAttempt | null>;

  findLatestByProblem(
    problemId: string,
    guestSessionId: string,
  ): Promise<WrittenExamAttempt | null>;

  appendRevision(
    input: AppendStudentAttemptRevisionInput,
  ): Promise<WrittenExamAttempt>;
}