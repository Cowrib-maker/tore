import { ConflictError } from "@/domain/errors/domain-error";
import type {
  AttemptPatch,
  CourtDecisionInput,
  ImportedProblemInput,
  LockedAttempt,
  NewAttemptInput,
  ProblemFilter,
  ReviewListItem,
  StudentExamRepository,
  UpsertOutcome,
} from "@/domain/repositories/student-exam-repository";
import {
  EXAM_AREAS,
  type AttemptItem,
  type AutoIndicators,
  type CourtDecisionRef,
  type ExamArea,
  type ExamAttempt,
  type ExamConfig,
  type ExamCitation,
  type ExamProblemKey,
  type ExamProblemPublic,
  type ReviewFlag,
  type ReviewStatus,
  type Rubric,
  type SelfRatings,
  type SourceLocator,
} from "@/domain/student/exam/types";
import { getPrismaClient, type PrismaDbClient } from "@/infrastructure/database/prisma-client";
import type { Prisma } from "@/generated/prisma/client";

type Json = Prisma.InputJsonValue;
const asJson = (v: unknown) => v as Json;

type ProblemRecord = {
  id: string;
  area: ExamArea;
  ordinal: number;
  ordinalLabel: string;
  statement: string;
  questions: unknown;
  topic: string | null;
  difficulty: number | null;
  sourceFile: string;
  sourceLocator: unknown;
  reviewStatus: ReviewStatus;
  reviewFlags: string[];
};

const problemSelect = {
  id: true,
  area: true,
  ordinal: true,
  ordinalLabel: true,
  statement: true,
  questions: true,
  topic: true,
  difficulty: true,
  sourceFile: true,
  sourceLocator: true,
  reviewStatus: true,
  reviewFlags: true,
} as const;

const mapProblem = (r: ProblemRecord): ExamProblemPublic => ({
  id: r.id,
  area: r.area,
  ordinal: r.ordinal,
  ordinalLabel: r.ordinalLabel,
  statement: r.statement,
  questions: Array.isArray(r.questions) ? (r.questions as string[]) : [],
  topic: r.topic,
  difficulty: r.difficulty,
  sourceFile: r.sourceFile,
  sourceLocator: r.sourceLocator as SourceLocator,
  reviewStatus: r.reviewStatus,
  reviewFlags: r.reviewFlags as ReviewFlag[],
});

type ItemRecord = {
  problemId: string;
  position: number;
  answerText: string;
  methodChecks: number[];
  answerUpdatedAt: Date | null;
  selfRatings: unknown;
  scoreAwarded: { toString(): string } | null;
  scoreMax: number | null;
  autoIndicators: unknown;
};

type AttemptRecord = {
  id: string;
  userId: string;
  mode: "STUDY" | "EXAM";
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  config: unknown;
  studyProblemId: string | null;
  startedAt: Date;
  deadlineAt: Date | null;
  submittedAt: Date | null;
  finalizedAt: Date | null;
  scoreTotal: { toString(): string } | null;
  scoreMax: number | null;
  items: ItemRecord[];
};

const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

const mapItem = (i: ItemRecord): AttemptItem => ({
  problemId: i.problemId,
  position: i.position,
  answerText: i.answerText,
  methodChecks: i.methodChecks,
  answerUpdatedAt: i.answerUpdatedAt,
  selfRatings: (i.selfRatings as SelfRatings | null) ?? null,
  scoreAwarded: num(i.scoreAwarded),
  scoreMax: i.scoreMax,
  autoIndicators: (i.autoIndicators as AutoIndicators | null) ?? null,
});

const mapAttempt = (a: AttemptRecord): ExamAttempt => ({
  id: a.id,
  userId: a.userId,
  mode: a.mode,
  status: a.status,
  config: (a.config as ExamConfig | null) ?? null,
  studyProblemId: a.studyProblemId,
  startedAt: a.startedAt,
  deadlineAt: a.deadlineAt,
  submittedAt: a.submittedAt,
  finalizedAt: a.finalizedAt,
  scoreTotal: num(a.scoreTotal),
  scoreMax: a.scoreMax,
  items: a.items.map(mapItem).sort((x, y) => x.position - y.position),
});

const attemptInclude = { items: true } as const;
const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export class PrismaStudentExamRepository implements StudentExamRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  // ── court decision extract index ──────────────────────────────────────────

  async upsertCourtDecisions(entries: readonly CourtDecisionInput[]) {
    const out = { created: 0, unchanged: 0, updated: 0 };
    for (const e of entries) {
      const data = {
        area: e.area,
        chapter: e.chapter,
        courtDate: e.courtDate,
        caseNumber: e.caseNumber,
        topic: e.topic,
        pageFrom: e.pageFrom,
        pageTo: e.pageTo,
        sourceFile: e.sourceFile,
      };
      const existing = await this.db.studentCourtDecision.findUnique({ where: { sourceKey: e.sourceKey } });
      if (!existing) {
        try {
          await this.db.studentCourtDecision.create({ data: { sourceKey: e.sourceKey, ...data } });
          out.created += 1;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          out.unchanged += 1; // a parallel run inserted the same entry
        }
        continue;
      }
      const same = (Object.keys(data) as Array<keyof typeof data>).every((k) => existing[k] === data[k]);
      if (same) {
        out.unchanged += 1;
      } else {
        await this.db.studentCourtDecision.update({ where: { sourceKey: e.sourceKey }, data });
        out.updated += 1;
      }
    }
    return out;
  }

  async listCourtDecisions(area?: ExamArea): Promise<CourtDecisionRef[]> {
    const rows = await this.db.studentCourtDecision.findMany({
      where: area ? { area } : {},
      orderBy: [{ chapter: "asc" }, { courtDate: "desc" }, { id: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      area: r.area as ExamArea,
      chapter: r.chapter,
      courtDate: r.courtDate,
      caseNumber: r.caseNumber,
      topic: r.topic,
      pageFrom: r.pageFrom,
      pageTo: r.pageTo,
      sourceFile: r.sourceFile,
    }));
  }

  // ── problem bank ──────────────────────────────────────────────────────────

  async upsertImported(input: ImportedProblemInput): Promise<UpsertOutcome> {
    const existing = await this.db.studentExamProblem.findUnique({
      where: { sourceKey: input.sourceKey },
      select: { id: true, contentHash: true },
    });
    const keyData = {
      modelAnswer: input.key.modelAnswer,
      answerOutline: asJson(input.key.answerOutline),
      legalProvisions: asJson(input.key.legalProvisions),
      courtCitations: asJson(input.key.courtCitations),
      rubric: asJson(input.key.rubric),
      provenance: input.key.provenance,
    };

    if (!existing) {
      const duplicate = await this.db.studentExamProblem.findFirst({
        where: { statementHash: input.statementHash, contentHash: input.contentHash, area: input.area },
        select: { id: true },
      });
      if (duplicate) return "duplicate";
      try {
        await this.db.studentExamProblem.create({
          data: {
            sourceKey: input.sourceKey,
            area: input.area,
            ordinal: input.ordinal,
            ordinalLabel: input.ordinalLabel,
            statement: input.statement,
            questions: asJson(input.questions),
            sourceFile: input.sourceFile,
            sourceLocator: asJson(input.locator),
            statementHash: input.statementHash,
            contentHash: input.contentHash,
            reviewStatus: input.reviewStatus,
            reviewFlags: input.flags,
            key: { create: keyData },
          },
        });
        return "created";
      } catch (error) {
        if (isUniqueViolation(error)) return this.upsertImported(input); // a parallel run created it: re-evaluate as an existing row
        throw error;
      }
    }

    if (existing.contentHash === input.contentHash) return "unchanged";

    // The source text changed since the last import: update the source-derived fields but never auto-approve; a human re-checks it.
    await this.db.studentExamProblem.update({
      where: { id: existing.id },
      data: {
        ordinal: input.ordinal,
        ordinalLabel: input.ordinalLabel,
        statement: input.statement,
        questions: asJson(input.questions),
        sourceLocator: asJson(input.locator),
        statementHash: input.statementHash,
        contentHash: input.contentHash,
        reviewStatus: "NEEDS_REVIEW",
        reviewFlags: [...new Set<string>([...input.flags, "SOURCE_CHANGED"])],
        key: { upsert: { create: keyData, update: keyData } },
      },
    });
    return "changed";
  }

  async listProblems(filter: ProblemFilter): Promise<ExamProblemPublic[]> {
    const rows = await this.db.studentExamProblem.findMany({
      where: {
        reviewStatus: { in: [...filter.statuses] },
        ...(filter.areas ? { area: { in: [...filter.areas] } } : {}),
        ...(filter.topic ? { topic: filter.topic } : {}),
        ...(filter.ids ? { id: { in: [...filter.ids] } } : {}),
      },
      select: problemSelect,
      orderBy: [{ area: "asc" }, { ordinal: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => mapProblem(r as ProblemRecord));
  }

  async getProblem(id: string): Promise<ExamProblemPublic | null> {
    const row = await this.db.studentExamProblem.findUnique({ where: { id }, select: problemSelect });
    return row ? mapProblem(row as ProblemRecord) : null;
  }

  async getKeys(problemIds: readonly string[]): Promise<ExamProblemKey[]> {
    if (problemIds.length === 0) return [];
    const rows = await this.db.studentExamProblemKey.findMany({ where: { problemId: { in: [...problemIds] } } });
    return rows.map((r) => ({
      problemId: r.problemId,
      modelAnswer: r.modelAnswer,
      answerOutline: (r.answerOutline as string[]) ?? [],
      legalProvisions: (r.legalProvisions as ExamCitation[]) ?? [],
      courtCitations: (r.courtCitations as ExamCitation[]) ?? [],
      rubric: r.rubric as Rubric,
      provenance: "SOURCE_DOCX",
    }));
  }

  async countByArea(statuses: readonly ReviewStatus[]): Promise<Record<ExamArea, number>> {
    const groups = await this.db.studentExamProblem.groupBy({
      by: ["area"],
      where: { reviewStatus: { in: [...statuses] } },
      _count: { _all: true },
    });
    const out = Object.fromEntries(EXAM_AREAS.map((a) => [a, 0])) as Record<ExamArea, number>;
    for (const g of groups) out[g.area as ExamArea] = g._count._all;
    return out;
  }

  async listTopics(statuses: readonly ReviewStatus[]): Promise<string[]> {
    const rows = await this.db.studentExamProblem.findMany({
      where: { reviewStatus: { in: [...statuses] }, topic: { not: null } },
      select: { topic: true },
      distinct: ["topic"],
      orderBy: { topic: "asc" },
    });
    return rows.map((r) => r.topic!).filter(Boolean);
  }

  async listForReview(statuses?: readonly ReviewStatus[]): Promise<ReviewListItem[]> {
    const rows = await this.db.studentExamProblem.findMany({
      where: statuses ? { reviewStatus: { in: [...statuses] } } : {},
      select: { ...problemSelect, reviewNote: true, key: { select: { modelAnswer: true } } },
      orderBy: [{ area: "asc" }, { ordinal: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({
      ...mapProblem(r as unknown as ProblemRecord),
      reviewNote: r.reviewNote,
      hasModelAnswer: Boolean(r.key?.modelAnswer),
    }));
  }

  async setReview(
    id: string,
    patch: { status: ReviewStatus; note: string | null; reviewerId: string; topic?: string | null; difficulty?: number | null; at: Date },
  ): Promise<boolean> {
    const result = await this.db.studentExamProblem.updateMany({
      where: { id },
      data: {
        reviewStatus: patch.status,
        reviewNote: patch.note,
        reviewedByUserId: patch.reviewerId,
        reviewedAt: patch.at,
        ...(patch.topic !== undefined ? { topic: patch.topic } : {}),
        ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
      },
    });
    return result.count > 0;
  }

  // ── attempts ──────────────────────────────────────────────────────────────

  async createAttempt(input: NewAttemptInput): Promise<ExamAttempt> {
    try {
      const row = await this.db.studentExamAttempt.create({
        data: {
          userId: input.userId,
          mode: input.mode,
          config: input.config ? asJson(input.config) : undefined,
          studyProblemId: input.studyProblemId,
          startedAt: input.startedAt,
          deadlineAt: input.deadlineAt,
          items: { create: input.problemIds.map((problemId, position) => ({ problemId, position, methodChecks: [] })) },
        },
        include: attemptInclude,
      });
      return mapAttempt(row as unknown as AttemptRecord);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("An attempt is already in progress.");
      throw error;
    }
  }

  async findAttempt(attemptId: string, userId: string): Promise<ExamAttempt | null> {
    const row = await this.db.studentExamAttempt.findFirst({ where: { id: attemptId, userId }, include: attemptInclude });
    return row ? mapAttempt(row as unknown as AttemptRecord) : null;
  }

  async findActiveExam(userId: string): Promise<ExamAttempt | null> {
    const row = await this.db.studentExamAttempt.findFirst({
      where: { userId, mode: "EXAM", status: "IN_PROGRESS" },
      include: attemptInclude,
    });
    return row ? mapAttempt(row as unknown as AttemptRecord) : null;
  }

  async findActiveStudy(userId: string, problemId: string): Promise<ExamAttempt | null> {
    const row = await this.db.studentExamAttempt.findFirst({
      where: { userId, mode: "STUDY", status: "IN_PROGRESS", studyProblemId: problemId },
      include: attemptInclude,
    });
    return row ? mapAttempt(row as unknown as AttemptRecord) : null;
  }

  async listAttempts(userId: string, limit: number): Promise<ExamAttempt[]> {
    const rows = await this.db.studentExamAttempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: attemptInclude,
    });
    return rows.map((r) => mapAttempt(r as unknown as AttemptRecord));
  }

  async withLockedAttempt<T>(attemptId: string, userId: string, fn: (locked: LockedAttempt) => Promise<T>): Promise<T | null> {
    return this.db.$transaction(async (tx) => {
      // Row lock: concurrent saves/submits of the same attempt queue up here, so each sees the previous one's committed state.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "student_exam_attempts" WHERE "id" = ${attemptId} AND "user_id" = ${userId} FOR UPDATE`;
      if (locked.length === 0) return null;

      const load = async (): Promise<ExamAttempt> => {
        const row = await tx.studentExamAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: attemptInclude });
        return mapAttempt(row as unknown as AttemptRecord);
      };

      const update = async (patch: AttemptPatch): Promise<ExamAttempt> => {
        if (
          patch.status !== undefined || patch.submittedAt !== undefined || patch.finalizedAt !== undefined ||
          patch.scoreTotal !== undefined || patch.scoreMax !== undefined
        ) {
          await tx.studentExamAttempt.update({
            where: { id: attemptId },
            data: {
              ...(patch.status !== undefined ? { status: patch.status } : {}),
              ...(patch.submittedAt !== undefined ? { submittedAt: patch.submittedAt } : {}),
              ...(patch.finalizedAt !== undefined ? { finalizedAt: patch.finalizedAt } : {}),
              ...(patch.scoreTotal !== undefined ? { scoreTotal: patch.scoreTotal } : {}),
              ...(patch.scoreMax !== undefined ? { scoreMax: patch.scoreMax } : {}),
            },
          });
        }
        for (const i of patch.items ?? []) {
          await tx.studentExamAttemptItem.update({
            where: { attemptId_problemId: { attemptId, problemId: i.problemId } },
            data: {
              ...(i.answerText !== undefined ? { answerText: i.answerText } : {}),
              ...(i.methodChecks !== undefined ? { methodChecks: i.methodChecks } : {}),
              ...(i.answerUpdatedAt !== undefined ? { answerUpdatedAt: i.answerUpdatedAt } : {}),
              ...(i.selfRatings !== undefined ? { selfRatings: asJson(i.selfRatings) } : {}),
              ...(i.scoreAwarded !== undefined ? { scoreAwarded: i.scoreAwarded } : {}),
              ...(i.scoreMax !== undefined ? { scoreMax: i.scoreMax } : {}),
              ...(i.autoIndicators !== undefined ? { autoIndicators: asJson(i.autoIndicators) } : {}),
            },
          });
        }
        return load();
      };

      return fn({ attempt: await load(), update });
    });
  }
}

export const studentExamRepository = new PrismaStudentExamRepository();
