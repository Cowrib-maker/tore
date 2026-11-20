import { Prisma } from "@/generated/prisma/client";
import type {
  AppendStudentAttemptRevisionInput,
  CreateStudentAttemptInput,
  StudentAttemptRepository,
} from "@/domain/repositories/student-attempt-repository";
import type {
  AttemptRevision,
  Hint,
  WrittenExamAttempt,
} from "@/domain/student/written-exam-types";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asNullableJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : asJson(value);
}

function mapRow(row: {
  id: string;
  problemId: string;
  status: string;
  answerHistory: Prisma.JsonValue;
  hintsRevealed: Prisma.JsonValue;
  finalGradeJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): WrittenExamAttempt {
  return {
    id: row.id,
    problemId: row.problemId,
    status: row.status as WrittenExamAttempt["status"],
    answerHistory: (row.answerHistory ?? []) as unknown as readonly AttemptRevision[],
    hintsRevealed: (row.hintsRevealed ?? []) as unknown as readonly Hint[],
    finalGrade: (row.finalGradeJson ?? null) as unknown as WrittenExamAttempt["finalGrade"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaStudentAttemptRepository
  implements StudentAttemptRepository
{
  constructor(private readonly client?: PrismaDbClient) {}

  async create(input: CreateStudentAttemptInput): Promise<WrittenExamAttempt> {
    const db = getPrismaClient(this.client);
    const row = await db.studentAttempt.create({
      data: {
        problemId: input.problemId,
        trackId: input.trackId,
        guestSessionId: input.guestSessionId,
        status: "in_progress",
        answerHistory: asJson([]),
        hintsRevealed: asJson([]),
      },
    });
    return mapRow(row);
  }

  async findById(
    id: string,
    guestSessionId: string,
  ): Promise<WrittenExamAttempt | null> {
    const db = getPrismaClient(this.client);
    const row = await db.studentAttempt.findFirst({
      where: { id, guestSessionId },
    });
    return row ? mapRow(row) : null;
  }

  async findLatestByProblem(
    problemId: string,
    guestSessionId: string,
  ): Promise<WrittenExamAttempt | null> {
    const db = getPrismaClient(this.client);
    const row = await db.studentAttempt.findFirst({
      where: { problemId, guestSessionId },
      orderBy: { updatedAt: "desc" },
    });
    return row ? mapRow(row) : null;
  }

  async appendRevision(
    input: AppendStudentAttemptRevisionInput,
  ): Promise<WrittenExamAttempt> {
    const db = getPrismaClient(this.client);

    const existing = await db.studentAttempt.findFirst({
      where: {
        id: input.id,
        guestSessionId: input.guestSessionId,
      },
    });

    if (!existing) {
      throw new Error("StudentAttempt not found");
    }

    const existingAnswerHistory =
      (existing.answerHistory ?? []) as unknown as AttemptRevision[];

    const answerHistory = input.revision
      ? [...existingAnswerHistory, input.revision]
      : existingAnswerHistory;

    const hintsRevealed = input.hint
      ? [
          ...((existing.hintsRevealed ?? []) as unknown as Hint[]),
          input.hint,
        ]
      : ((existing.hintsRevealed ?? []) as unknown as Hint[]);

    const updated = await db.studentAttempt.updateMany({
      where: {
        id: input.id,
        guestSessionId: input.guestSessionId,
      },
      data: {
        answerHistory: asJson(answerHistory),
        hintsRevealed: asJson(hintsRevealed),
        status: input.status ?? existing.status,
        finalGradeJson:
          input.finalGrade !== undefined
            ? asNullableJson(input.finalGrade)
            : (existing.finalGradeJson ?? Prisma.JsonNull),
      },
    });

    if (updated.count !== 1) {
      throw new Error("StudentAttempt not found");
    }

    const row = await db.studentAttempt.findFirst({
      where: {
        id: input.id,
        guestSessionId: input.guestSessionId,
      },
    });

    if (!row) {
      throw new Error("StudentAttempt not found");
    }

    return mapRow(row);
  }
}

export const studentAttemptRepository = new PrismaStudentAttemptRepository();