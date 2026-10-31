/**
 * TORE Student: lawyer-selection examination preparation.
 *
 * Two kinds of data are kept strictly apart:
 *  - the PUBLIC problem (statement + questions): safe to send to a browser at any time;
 *  - the KEY (model answer, outline, citations, rubric): only ever returned by a use case after the attempt has been submitted.
 */

export const EXAM_AREAS = ["CRIMINAL", "CIVIL", "ADMINISTRATIVE", "CONSTITUTIONAL"] as const;
export type ExamArea = (typeof EXAM_AREAS)[number];

export function parseExamArea(value: unknown): ExamArea | null {
  return typeof value === "string" && (EXAM_AREAS as readonly string[]).includes(value) ? (value as ExamArea) : null;
}

/**
 * IMPORTED: parsed cleanly, not yet reviewed by a lawyer (visible to students with a "not legally reviewed" notice).
 * NEEDS_REVIEW: the importer was unsure (structure, duplicates, missing answer) -> hidden from students until a reviewer decides.
 * APPROVED: a reviewer checked it. REJECTED: withdrawn.
 */
export const REVIEW_STATUSES = ["IMPORTED", "NEEDS_REVIEW", "APPROVED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const STUDENT_VISIBLE_STATUSES: readonly ReviewStatus[] = ["IMPORTED", "APPROVED"];

/** Machine-readable reasons a problem needs a human. Shown to reviewers (and the legal ones to students as warnings). */
export const REVIEW_FLAGS = [
  "NO_ANSWER_MARKER", // no "жишиг хариулт" marker found: question/answer boundary unknown
  "EMPTY_MODEL_ANSWER", // the marker exists but the source gives no answer text after it
  "NO_QUESTION_MARKER", // no "Асуулт" / "Шийдвэрлэх асуудал" marker found
  "EMPTY_STATEMENT",
  "DUPLICATE_ORDINAL", // the same "Бодлого-N" heading appears more than once in the file
  "DUPLICATE_STATEMENT", // identical statement already present (skipped)
  "OCR_NOISE_SUSPECTED", // words mixing Latin and Cyrillic letters: likely a scan/OCR artefact in the source
  "POSSIBLY_OUTDATED_LAW", // cites a law, abbreviation or year that predates the law now in force (heuristic)
  "MODEL_ANSWER_TRUNCATED_OR_SHORT",
  "SOURCE_CHANGED", // a re-import found different source text for an existing problem
] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

/** Flags that tell a STUDENT something about the legal reliability of the material. */
export const STUDENT_WARNING_FLAGS: readonly ReviewFlag[] = ["POSSIBLY_OUTDATED_LAW", "OCR_NOISE_SUSPECTED", "MODEL_ANSWER_TRUNCATED_OR_SHORT"];

export type SourceLocator = {
  /** Heading as written in the source, e.g. "Бодлого-11". */
  heading: string;
  /** DOCX has no stable page numbers; this is the paragraph range in the extracted text. Page stays null rather than guessed. */
  page: number | null;
  paragraphStart: number;
  paragraphEnd: number;
};

export type ExamProblemPublic = {
  id: string;
  area: ExamArea;
  ordinal: number;
  ordinalLabel: string;
  statement: string;
  /** Sub-questions / question paragraphs, verbatim and in source order. */
  questions: string[];
  topic: string | null;
  /** 1-5 when a reviewer set it; null = unrated (the sources do not state a difficulty). */
  difficulty: number | null;
  sourceFile: string;
  sourceLocator: SourceLocator;
  reviewStatus: ReviewStatus;
  reviewFlags: ReviewFlag[];
};

export type CitationOrigin = "SOURCE_PATTERN";

export type ExamCitation = {
  text: string;
  /** Extracted from the source model answer by a text pattern; not a verification that the provision is current law. */
  origin: CitationOrigin;
};

/** One row of a Supreme Court decision extract index (reference material; not linked to problems automatically). */
export type CourtDecisionRef = {
  id: string;
  area: ExamArea;
  chapter: number | null;
  courtDate: string | null;
  caseNumber: string | null;
  topic: string;
  pageFrom: number | null;
  pageTo: number | null;
  sourceFile: string;
};

export type RubricCriterionId = "issues" | "law" | "interpretation" | "application" | "counter" | "conclusion";

export type RubricCriterion = { id: RubricCriterionId; weight: number };
export type Rubric = { criteria: RubricCriterion[] };

export type ExamProblemKey = {
  problemId: string;
  /** Verbatim from the source document. Null when the source had no recognizable model answer. */
  modelAnswer: string | null;
  /** Headings found inside the source answer (its own methodology), verbatim. */
  answerOutline: string[];
  legalProvisions: ExamCitation[];
  courtCitations: ExamCitation[];
  rubric: Rubric;
  /** "SOURCE_DOCX": the answer is the source's, not an official or AI-generated answer. */
  provenance: "SOURCE_DOCX";
};

export type AttemptMode = "STUDY" | "EXAM";
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";

export type ExamConfig = {
  areas: ExamArea[];
  count: number;
  minutes: number;
  /** Optional weights per area, e.g. { CRIMINAL: 2, CIVIL: 1 }. Missing = 1. */
  areaWeights?: Partial<Record<ExamArea, number>>;
  topic?: string | null;
  /** Inclusive difficulty window; problems without a rating are treated as unrated and still eligible. */
  difficultyMin?: number;
  difficultyMax?: number;
  /** Random seed recorded so the draw is reproducible for audit. */
  seed: string;
};

export type SelfRatings = Partial<Record<RubricCriterionId, number>>;

export type AutoIndicators = {
  /** Provisions from the source answer that also appear in the student's answer text. Orientation only, never a score. */
  provisionsMentioned: string[];
  provisionsExpected: number;
  answerLength: number;
};

export type AttemptItem = {
  problemId: string;
  position: number;
  answerText: string;
  methodChecks: number[];
  answerUpdatedAt: Date | null;
  selfRatings: SelfRatings | null;
  /** Server-computed from selfRatings and the rubric. */
  scoreAwarded: number | null;
  scoreMax: number | null;
  autoIndicators: AutoIndicators | null;
};

export type ExamAttempt = {
  id: string;
  userId: string;
  mode: AttemptMode;
  status: AttemptStatus;
  config: ExamConfig | null;
  studyProblemId: string | null;
  startedAt: Date;
  deadlineAt: Date | null;
  submittedAt: Date | null;
  /** Set once the student's self-assessment was recorded and scored; locks the scores. */
  finalizedAt: Date | null;
  scoreTotal: number | null;
  scoreMax: number | null;
  items: AttemptItem[];
};

export const ANSWER_MAX_CHARS = 20_000;
/** Seconds after the deadline during which an in-flight autosave is still accepted. */
export const DEADLINE_GRACE_MS = 15_000;

/** TORE's own seven-step method (not claimed to come from the sources). The source's own method stays in the answer outline. */
export const METHOD_STEP_COUNT = 7;
