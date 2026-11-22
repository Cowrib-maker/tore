/**
 * Domain-agnostic written-exam / AI-tutor types.
 *
 * Distinct from `StudentQuiz`/`StudentProblemGrade` (the existing
 * multiple-choice + flat-rubric pipeline, unchanged — see types.ts). This
 * is the new doctrine-grounded pipeline: rubric derived from a LegalTest,
 * per-element subsumption results, staged hints, and a persisted,
 * append-only attempt history instead of a single stateless grade.
 *
 * Naming note (resolves the StudentQuiz.kind === "problem" collision):
 * nothing here reuses the word "problem" as a discriminator. The
 * multiple-choice variant stays `StudentQuizKind = "problem"` (unchanged,
 * still MC, still deterministic). This pipeline is always called the
 * "written exam" in code and UI.
 */
import type { LegalTest, SubsumptionMatchStatus } from "@/engine/doctrine";
import type { WrittenExamRubricItem } from "./rubric-from-legal-test";
import type { StudentLegalSource, StudentTrackId } from "./types";

export type ElementSubsumptionStatus =
  (typeof SubsumptionMatchStatus)[keyof typeof SubsumptionMatchStatus];

/** Per-element grading result — the output of DefaultSubsumptionEngine, reshaped for the UI/persistence layer. Never modifies the engine's own result shape, only carries it forward. */
export type ElementFeedback = {
  elementId: string;
  label: string;
  status: ElementSubsumptionStatus;
  /** Why: quotes/paraphrases the student's own text; never invents facts. */
  explanation: string;
  provenance: WrittenExamRubricItem["provenance"];
};

/**
 * Presentation-level evaluation dimensions (req #10) — groupings over the
 * element-level results, NOT new LegalElements. Each dimension's status is
 * derived deterministically from which underlying elements it covers.
 */
export type TutorDimensionStatus = "strong" | "developing" | "missing";

export type TutorDimension = {
  status: TutorDimensionStatus;
  note: string;
};

export type TutorEvaluation = {
  mode: "ai" | "fallback";
  issueSpotting: TutorDimension;
  authoritySelection: TutorDimension;
  methodology: TutorDimension;
  subsumption: TutorDimension;
  conclusion: TutorDimension;
  elementFeedback: readonly ElementFeedback[];
  hints: readonly string[];
  overallFeedback: string;
  needsSourceVerification: boolean;
  model?: string;
};

export type Hint = {
  elementId: string;
  label: string;
  /** Partial reveal derived from the element's own description — never the full model answer. */
  text: string;
  provenance: WrittenExamRubricItem["provenance"];
};

export type AttemptRevision = {
  answer: string;
  submittedAt: string;
  evaluation: TutorEvaluation;
};

export type WrittenExamAttemptStatus = "in_progress" | "graded";

export type WrittenExamAttempt = {
  id: string;
  problemId: string;
  status: WrittenExamAttemptStatus;
  /** Append-only — never overwrite a prior revision. */
  answerHistory: readonly AttemptRevision[];
  hintsRevealed: readonly Hint[];
  finalGrade: {
    total: number;
    maxTotal: number;
    percent: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A written-exam problem, standalone (not extending StudentLegalProblem —
 * that type's `rubric: StudentProblemRubricItem[]` uses a fixed 5-id
 * union incompatible with element-derived rubric ids, so this is its own
 * type rather than an incompatible override).
 */
export type WrittenExamProblem = {
  id: string;
  trackId: StudentTrackId;
  title: string;
  intro: string;
  factPattern: string;
  prompt: string;
  sources: readonly StudentLegalSource[];
  /** The source-backed LegalTest this problem is graded against — the AI mapper and DefaultSubsumptionEngine run directly off this, unmodified. */
  legalTest: LegalTest;
  rubric: readonly WrittenExamRubricItem[];
};
