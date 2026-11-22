import type {
  AppendStudentAttemptRevisionInput,
  CreateStudentAttemptInput,
  StudentAttemptRepository,
} from "@/domain/repositories/student-attempt-repository";
import type { WrittenExamAttempt } from "@/domain/student/written-exam-types";

let counter = 0;

export class InMemoryStudentAttemptRepository implements StudentAttemptRepository {
  private readonly byId = new Map<string, WrittenExamAttempt>();
  private readonly meta = new Map<string, { problemId: string; guestSessionId: string | null }>();

  async create(input: CreateStudentAttemptInput): Promise<WrittenExamAttempt> {
    const now = new Date().toISOString();
    const attempt: WrittenExamAttempt = {
      id: `in-memory-attempt-${++counter}`,
      problemId: input.problemId,
      status: "in_progress",
      answerHistory: [],
      hintsRevealed: [],
      finalGrade: null,
      createdAt: now,
      updatedAt: now,
    };

    this.byId.set(attempt.id, attempt);
    this.meta.set(attempt.id, {
      problemId: input.problemId,
      guestSessionId: input.guestSessionId,
    });

    return attempt;
  }

  async findById(
    id: string,
    guestSessionId: string,
  ): Promise<WrittenExamAttempt | null> {
    const attempt = this.byId.get(id);
    const meta = this.meta.get(id);

    if (!attempt || meta?.guestSessionId !== guestSessionId) {
      return null;
    }

    return attempt;
  }

  async findLatestByProblem(
    problemId: string,
    guestSessionId: string,
  ): Promise<WrittenExamAttempt | null> {
    let latest: WrittenExamAttempt | null = null;

    for (const [id, attempt] of this.byId) {
      const meta = this.meta.get(id);

      if (meta?.problemId !== problemId || meta.guestSessionId !== guestSessionId) {
        continue;
      }

      if (!latest || attempt.updatedAt > latest.updatedAt) {
        latest = attempt;
      }
    }

    return latest;
  }

  async appendRevision(
    input: AppendStudentAttemptRevisionInput,
  ): Promise<WrittenExamAttempt> {
    const existing = await this.findById(input.id, input.guestSessionId);

    if (!existing) {
      throw new Error("StudentAttempt not found");
    }

    const updated: WrittenExamAttempt = {
      ...existing,
      answerHistory: input.revision
        ? [...existing.answerHistory, input.revision]
        : existing.answerHistory,
      hintsRevealed: input.hint
        ? [...existing.hintsRevealed, input.hint]
        : existing.hintsRevealed,
      status: input.status ?? existing.status,
      finalGrade: input.finalGrade !== undefined
        ? input.finalGrade
        : existing.finalGrade,
      updatedAt: new Date().toISOString(),
    };

    this.byId.set(input.id, updated);
    return updated;
  }
}