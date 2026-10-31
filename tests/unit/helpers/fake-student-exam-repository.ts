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
  type CourtDecisionRef,
  type ExamArea,
  type ExamAttempt,
  type ExamProblemKey,
  type ExamProblemPublic,
  type ReviewFlag,
  type ReviewStatus,
} from "@/domain/student/exam/types";

type StoredProblem = ExamProblemPublic & { statementHash: string; contentHash: string; reviewNote: string | null; sourceKey: string };

/** In-memory repository with the same contract as the Prisma one (owner-scoped attempts, one active exam, serialised locks). */
export class FakeStudentExamRepository implements StudentExamRepository {
  problems = new Map<string, StoredProblem>();
  keys = new Map<string, ExamProblemKey>();
  attempts = new Map<string, ExamAttempt>();
  private seq = 0;
  private locks = new Map<string, Promise<unknown>>();

  decisions = new Map<string, CourtDecisionRef & { sourceKey: string }>();

  async upsertCourtDecisions(entries: readonly CourtDecisionInput[]) {
    const out = { created: 0, unchanged: 0, updated: 0 };
    for (const e of entries) {
      const existing = this.decisions.get(e.sourceKey);
      const row = { id: existing?.id ?? `d${++this.seq}`, ...e };
      if (!existing) out.created += 1;
      else if (JSON.stringify({ ...existing, id: "" }) === JSON.stringify({ ...row, id: "" })) out.unchanged += 1;
      else out.updated += 1;
      this.decisions.set(e.sourceKey, row);
    }
    return out;
  }

  async listCourtDecisions(area?: ExamArea) {
    return [...this.decisions.values()]
      .filter((d) => !area || d.area === area)
      .map((d) => ({ id: d.id, area: d.area, chapter: d.chapter, courtDate: d.courtDate, caseNumber: d.caseNumber, topic: d.topic, pageFrom: d.pageFrom, pageTo: d.pageTo, sourceFile: d.sourceFile }));
  }

  async upsertImported(input: ImportedProblemInput): Promise<UpsertOutcome> {
    const existing = [...this.problems.values()].find((p) => p.sourceKey === input.sourceKey);
    const key: ExamProblemKey = { problemId: "", ...input.key };
    if (!existing) {
      if ([...this.problems.values()].some((p) => p.statementHash === input.statementHash && p.contentHash === input.contentHash && p.area === input.area)) return "duplicate";
      const id = `p${++this.seq}`;
      this.problems.set(id, {
        id,
        sourceKey: input.sourceKey,
        area: input.area,
        ordinal: input.ordinal,
        ordinalLabel: input.ordinalLabel,
        statement: input.statement,
        questions: input.questions,
        topic: null,
        difficulty: null,
        sourceFile: input.sourceFile,
        sourceLocator: input.locator,
        reviewStatus: input.reviewStatus,
        reviewFlags: input.flags,
        statementHash: input.statementHash,
        contentHash: input.contentHash,
        reviewNote: null,
      });
      this.keys.set(id, { ...key, problemId: id });
      return "created";
    }
    if (existing.contentHash === input.contentHash) return "unchanged";
    Object.assign(existing, {
      statement: input.statement,
      questions: input.questions,
      sourceLocator: input.locator,
      statementHash: input.statementHash,
      contentHash: input.contentHash,
      reviewStatus: "NEEDS_REVIEW" as ReviewStatus,
      reviewFlags: [...new Set<ReviewFlag>([...input.flags, "SOURCE_CHANGED"])],
    });
    this.keys.set(existing.id, { ...key, problemId: existing.id });
    return "changed";
  }

  /** Public projection only: no key fields ever appear here. */
  private pub(p: StoredProblem): ExamProblemPublic {
    return {
      id: p.id, area: p.area, ordinal: p.ordinal, ordinalLabel: p.ordinalLabel, statement: p.statement, questions: [...p.questions],
      topic: p.topic, difficulty: p.difficulty, sourceFile: p.sourceFile, sourceLocator: p.sourceLocator,
      reviewStatus: p.reviewStatus, reviewFlags: [...p.reviewFlags],
    };
  }

  async listProblems(filter: ProblemFilter): Promise<ExamProblemPublic[]> {
    return [...this.problems.values()]
      .filter(
        (p) =>
          filter.statuses.includes(p.reviewStatus) &&
          (!filter.areas || filter.areas.includes(p.area)) &&
          (!filter.topic || p.topic === filter.topic) &&
          (!filter.ids || filter.ids.includes(p.id)),
      )
      .sort((a, b) => a.area.localeCompare(b.area) || a.ordinal - b.ordinal || a.id.localeCompare(b.id))
      .map((p) => this.pub(p));
  }

  async getProblem(id: string) {
    const p = this.problems.get(id);
    return p ? this.pub(p) : null;
  }

  async getKeys(ids: readonly string[]) {
    return ids.map((id) => this.keys.get(id)).filter((k): k is ExamProblemKey => Boolean(k));
  }

  async countByArea(statuses: readonly ReviewStatus[]) {
    const out = Object.fromEntries(EXAM_AREAS.map((a) => [a, 0])) as Record<ExamArea, number>;
    for (const p of this.problems.values()) if (statuses.includes(p.reviewStatus)) out[p.area] += 1;
    return out;
  }

  async listTopics(statuses: readonly ReviewStatus[]) {
    return [...new Set([...this.problems.values()].filter((p) => statuses.includes(p.reviewStatus) && p.topic).map((p) => p.topic!))].sort();
  }

  async listForReview(statuses?: readonly ReviewStatus[]): Promise<ReviewListItem[]> {
    return [...this.problems.values()]
      .filter((p) => !statuses || statuses.includes(p.reviewStatus))
      .map((p) => ({ ...this.pub(p), reviewNote: p.reviewNote, hasModelAnswer: Boolean(this.keys.get(p.id)?.modelAnswer) }));
  }

  async setReview(id: string, patch: { status: ReviewStatus; note: string | null; reviewerId: string; topic?: string | null; difficulty?: number | null; at: Date }) {
    const p = this.problems.get(id);
    if (!p) return false;
    p.reviewStatus = patch.status;
    p.reviewNote = patch.note;
    if (patch.topic !== undefined) p.topic = patch.topic;
    if (patch.difficulty !== undefined) p.difficulty = patch.difficulty;
    return true;
  }

  async createAttempt(input: NewAttemptInput): Promise<ExamAttempt> {
    // Synchronous check-and-insert: the real database gets the same guarantee from its partial unique indexes.
    const clash = [...this.attempts.values()].some(
      (x) =>
        x.userId === input.userId &&
        x.status === "IN_PROGRESS" &&
        x.mode === input.mode &&
        (input.mode === "EXAM" || x.studyProblemId === input.studyProblemId),
    );
    if (clash) throw new ConflictError("An attempt is already in progress.");
    const attempt: ExamAttempt = {
      id: `a${++this.seq}`,
      userId: input.userId,
      mode: input.mode,
      status: "IN_PROGRESS",
      config: input.config,
      studyProblemId: input.studyProblemId,
      startedAt: input.startedAt,
      deadlineAt: input.deadlineAt,
      submittedAt: null,
      finalizedAt: null,
      scoreTotal: null,
      scoreMax: null,
      items: input.problemIds.map((problemId, position) => ({
        problemId, position, answerText: "", methodChecks: [], answerUpdatedAt: null, selfRatings: null, scoreAwarded: null, scoreMax: null, autoIndicators: null,
      })),
    };
    this.attempts.set(attempt.id, attempt);
    return structuredClone(attempt);
  }

  async findAttempt(attemptId: string, userId: string) {
    const a = this.attempts.get(attemptId);
    return a && a.userId === userId ? structuredClone(a) : null;
  }

  async findActiveExam(userId: string) {
    const a = [...this.attempts.values()].find((x) => x.userId === userId && x.mode === "EXAM" && x.status === "IN_PROGRESS");
    return a ? structuredClone(a) : null;
  }

  async findActiveStudy(userId: string, problemId: string) {
    const a = [...this.attempts.values()].find(
      (x) => x.userId === userId && x.mode === "STUDY" && x.status === "IN_PROGRESS" && x.studyProblemId === problemId,
    );
    return a ? structuredClone(a) : null;
  }

  async listAttempts(userId: string, limit: number) {
    return [...this.attempts.values()]
      .filter((a) => a.userId === userId)
      .sort((x, y) => y.startedAt.getTime() - x.startedAt.getTime())
      .slice(0, limit)
      .map((a) => structuredClone(a));
  }

  async withLockedAttempt<T>(attemptId: string, userId: string, fn: (locked: LockedAttempt) => Promise<T>): Promise<T | null> {
    const previous = this.locks.get(attemptId) ?? Promise.resolve();
    const run = previous.then(async () => {
      const stored = this.attempts.get(attemptId);
      if (!stored || stored.userId !== userId) return null;
      // Yield so interleaved callers genuinely race for the lock.
      await Promise.resolve();
      const update = async (patch: AttemptPatch): Promise<ExamAttempt> => {
        if (patch.status !== undefined) stored.status = patch.status;
        if (patch.submittedAt !== undefined) stored.submittedAt = patch.submittedAt;
        if (patch.finalizedAt !== undefined) stored.finalizedAt = patch.finalizedAt;
        if (patch.scoreTotal !== undefined) stored.scoreTotal = patch.scoreTotal;
        if (patch.scoreMax !== undefined) stored.scoreMax = patch.scoreMax;
        for (const i of patch.items ?? []) {
          const item = stored.items.find((x) => x.problemId === i.problemId);
          if (!item) continue;
          if (i.answerText !== undefined) item.answerText = i.answerText;
          if (i.methodChecks !== undefined) item.methodChecks = i.methodChecks;
          if (i.answerUpdatedAt !== undefined) item.answerUpdatedAt = i.answerUpdatedAt;
          if (i.selfRatings !== undefined) item.selfRatings = i.selfRatings;
          if (i.scoreAwarded !== undefined) item.scoreAwarded = i.scoreAwarded;
          if (i.scoreMax !== undefined) item.scoreMax = i.scoreMax;
          if (i.autoIndicators !== undefined) item.autoIndicators = i.autoIndicators;
        }
        return structuredClone(stored);
      };
      return fn({ attempt: structuredClone(stored), update });
    });
    this.locks.set(attemptId, run.catch(() => undefined));
    return run as Promise<T | null>;
  }
}
