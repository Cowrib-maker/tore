export const StudentTrackId = {
  CRIMINAL: "criminal",
  CIVIL: "civil",
  ADMINISTRATIVE: "administrative",
} as const;

export type StudentTrackId =
  (typeof StudentTrackId)[keyof typeof StudentTrackId];

export const STUDENT_TRACK_IDS: readonly StudentTrackId[] = [
  StudentTrackId.CRIMINAL,
  StudentTrackId.CIVIL,
  StudentTrackId.ADMINISTRATIVE,
];

export function isStudentTrackId(value: string): value is StudentTrackId {
  return (STUDENT_TRACK_IDS as readonly string[]).includes(value);
}

export type StudentLessonKind = "theory" | "method";

export type StudentLessonSection = {
  heading: string;
  body: string;
};

export type StudentLesson = {
  id: string;
  trackId: StudentTrackId;
  kind: StudentLessonKind;
  title: string;
  summary: string;
  sections: readonly StudentLessonSection[];
};

export type StudentQuizKind = "test" | "problem";

export const STUDENT_QUIZ_KINDS: readonly StudentQuizKind[] = [
  "test",
  "problem",
];

export function isStudentQuizKind(value: string): value is StudentQuizKind {
  return (STUDENT_QUIZ_KINDS as readonly string[]).includes(value);
}

export type StudentQuizOption = {
  id: string;
  label: string;
};

export type StudentQuizQuestion = {
  id: string;
  prompt: string;
  factPattern?: string;
  options: readonly StudentQuizOption[];
  correctOptionId: string;
  explanation: string;
};

export type StudentQuiz = {
  id: string;
  trackId: StudentTrackId;
  kind: StudentQuizKind;
  title: string;
  intro: string;
  questions: readonly StudentQuizQuestion[];
};

export type StudentPublicQuestion = Omit<
  StudentQuizQuestion,
  "correctOptionId" | "explanation"
>;

export type StudentPublicQuiz = Omit<StudentQuiz, "questions"> & {
  questions: readonly StudentPublicQuestion[];
};

export type StudentGradeBand =
  | "excellent"
  | "good"
  | "average"
  | "pass"
  | "fail";

export type StudentQuestionReview = {
  questionId: string;
  prompt: string;
  factPattern?: string;
  chosenOptionId: string | null;
  chosenLabel: string | null;
  correctOptionId: string;
  correctLabel: string;
  explanation: string;
  correct: boolean;
};

export type StudentQuizGrade = {
  quizId: string;
  total: number;
  correct: number;
  missed: number;
  percent: number;
  band: StudentGradeBand;
  reviews: readonly StudentQuestionReview[];
};

export type StudentLegalSource = {
  title: string;
  publisher: string;
  url: string;
  note: string;
};

/**
 * Free-text case-study exercise: the student writes a full legal analysis
 * (not multiple choice) and gets it evaluated against a fixed rubric.
 * This is distinct from `StudentQuiz` (kind: "problem"), which is still a
 * multiple-choice exam. Kept as its own type/route so the two do not collide.
 */
export type StudentProblemRubricItem = {
  id: "issue" | "applicableLaw" | "legalReasoning" | "facts" | "conclusion";
  label: string;
  weight: number;
  guidance: string;
};

export type StudentLegalProblem = {
  id: string;
  trackId: StudentTrackId;
  title: string;
  intro: string;
  factPattern: string;
  prompt: string;
  sources: readonly StudentLegalSource[];
  rubric: readonly StudentProblemRubricItem[];
};

export type StudentProblemRubricScore = StudentProblemRubricItem & {
  score: number;
  satisfied: boolean;
};

/**
 * `mode` is always shown to the student: "ai" means a live model actually
 * read the answer; "fallback" means the AI call was unavailable/failed and
 * this is only a keyword/structure check. Never claim "ai" when the model
 * was not actually called — that would repeat the NEEDS_OCR-style honesty
 * bug already fixed elsewhere in Legal AI.
 */
export type StudentProblemEvaluation = {
  mode: "ai" | "fallback";
  label: string;
  strengths: readonly string[];
  weaknesses: readonly string[];
  missingIssues: readonly string[];
  missingProvisions: readonly string[];
  suggestions: readonly string[];
  sourceIntegrityNote: string;
  model?: string;
};

export type StudentProblemGrade = {
  problemId: string;
  total: number;
  maxTotal: number;
  rubric: readonly StudentProblemRubricScore[];
  needsSourceVerification: boolean;
  feedback: string;
  evaluation: StudentProblemEvaluation;
};
