import type {
  AttemptItem,
  AttemptMode,
  AttemptStatus,
  AutoIndicators,
  CourtDecisionRef,
  ExamArea,
  ExamAttempt,
  ExamConfig,
  ExamProblemKey,
  ExamProblemPublic,
  ReviewFlag,
  ReviewStatus,
  SelfRatings,
  SourceLocator,
} from "@/domain/student/exam/types";

/** What an importer hands to the repository: the public part and the key part of one source problem. */
export type ImportedProblemInput = {
  sourceKey: string;
  area: ExamArea;
  ordinal: number;
  ordinalLabel: string;
  statement: string;
  questions: string[];
  sourceFile: string;
  locator: SourceLocator;
  statementHash: string;
  contentHash: string;
  flags: ReviewFlag[];
  reviewStatus: ReviewStatus;
  key: Omit<ExamProblemKey, "problemId">;
};

/**
 * created: new problem. unchanged: same source text. changed: source text differs from what was imported before (the problem is
 * moved back to NEEDS_REVIEW, never silently overwritten). duplicate: the same statement already exists under another identity.
 */
export type UpsertOutcome = "created" | "unchanged" | "changed" | "duplicate";

export type ProblemFilter = {
  areas?: readonly ExamArea[];
  topic?: string | null;
  statuses: readonly ReviewStatus[];
  ids?: readonly string[];
};

export type ReviewListItem = ExamProblemPublic & {
  reviewNote: string | null;
  hasModelAnswer: boolean;
};

export type NewAttemptInput = {
  userId: string;
  mode: AttemptMode;
  config: ExamConfig | null;
  studyProblemId: string | null;
  startedAt: Date;
  deadlineAt: Date | null;
  problemIds: string[];
};

export type AttemptPatch = {
  status?: AttemptStatus;
  submittedAt?: Date;
  finalizedAt?: Date;
  scoreTotal?: number;
  scoreMax?: number;
  items?: Array<{
    problemId: string;
    answerText?: string;
    methodChecks?: number[];
    answerUpdatedAt?: Date;
    selfRatings?: SelfRatings;
    scoreAwarded?: number;
    scoreMax?: number;
    autoIndicators?: AutoIndicators;
  }>;
};

/** Operations allowed while one attempt row is locked; everything the callback does is atomic with respect to other callers. */
export type LockedAttempt = {
  attempt: ExamAttempt;
  update(patch: AttemptPatch): Promise<ExamAttempt>;
};

export type CourtDecisionInput = Omit<CourtDecisionRef, "id"> & { sourceKey: string };

export interface StudentExamRepository {
  // ── court decision extract index ────────────────────────────────────────────
  upsertCourtDecisions(entries: readonly CourtDecisionInput[]): Promise<{ created: number; unchanged: number; updated: number }>;
  listCourtDecisions(area?: ExamArea): Promise<CourtDecisionRef[]>;

  // ── problem bank ────────────────────────────────────────────────────────────
  upsertImported(input: ImportedProblemInput): Promise<UpsertOutcome>;
  listProblems(filter: ProblemFilter): Promise<ExamProblemPublic[]>;
  getProblem(id: string): Promise<ExamProblemPublic | null>;
  /** Answer key. Callers must have checked that the requesting student's attempt is no longer in progress. */
  getKeys(problemIds: readonly string[]): Promise<ExamProblemKey[]>;
  countByArea(statuses: readonly ReviewStatus[]): Promise<Record<ExamArea, number>>;
  listTopics(statuses: readonly ReviewStatus[]): Promise<string[]>;
  listForReview(statuses?: readonly ReviewStatus[]): Promise<ReviewListItem[]>;
  setReview(
    id: string,
    patch: { status: ReviewStatus; note: string | null; reviewerId: string; topic?: string | null; difficulty?: number | null; at: Date },
  ): Promise<boolean>;

  // ── attempts (every read is scoped to the owner) ────────────────────────────
  /** Throws ConflictError when the student already has an exam in progress. */
  createAttempt(input: NewAttemptInput): Promise<ExamAttempt>;
  findAttempt(attemptId: string, userId: string): Promise<ExamAttempt | null>;
  findActiveExam(userId: string): Promise<ExamAttempt | null>;
  findActiveStudy(userId: string, problemId: string): Promise<ExamAttempt | null>;
  /** Newest first. */
  listAttempts(userId: string, limit: number): Promise<ExamAttempt[]>;
  /** Returns null when the attempt does not exist or belongs to someone else. */
  withLockedAttempt<T>(attemptId: string, userId: string, fn: (locked: LockedAttempt) => Promise<T>): Promise<T | null>;
}

export type { AttemptItem };
