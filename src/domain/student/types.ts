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

export type StudentLegalSource = {
  title: string;
  publisher: string;
  url: string;
  note: string;
};

export type StudentTheoryCourse = {
  subject: string;
  topic: string;
  lesson: string;
  objectives: readonly string[];
  concepts: readonly string[];
  explanation: readonly StudentLessonSection[];
  legalSources: readonly StudentLegalSource[];
  examples: readonly string[];
  review: readonly string[];
};

export type StudentQuizKind = "test" | "problem";

export const STUDENT_QUIZ_KINDS: readonly StudentQuizKind[] = [
  "test",
  "problem",
];

export function isStudentQuizKind(value: string): value is StudentQuizKind {
  return (STUDENT_QUIZ_KINDS as readonly string[]).includes(value);
}

export const STUDENT_DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
export type StudentDifficulty = (typeof STUDENT_DIFFICULTIES)[number];

export function isStudentDifficulty(value: string): value is StudentDifficulty {
  return (STUDENT_DIFFICULTIES as readonly string[]).includes(value);
}

export type StudentQuestionType =
  | "single"
  | "multiple"
  | "truefalse"
  | "matching"
  | "short-answer";

export type StudentQuizOption = {
  id: string;
  label: string;
};

export type StudentMatchingPair = {
  left: string;
  right: string;
};

export type StudentQuizQuestion = {
  id: string;
  type?: StudentQuestionType;
  difficulty?: StudentDifficulty;
  prompt: string;
  factPattern?: string;
  options: readonly StudentQuizOption[];
  matchingOptions?: readonly StudentQuizOption[];
  correctOptionId?: string;
  correctOptionIds?: readonly string[];
  matchingPairs?: readonly StudentMatchingPair[];
  acceptedAnswers?: readonly string[];
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
  | "correctOptionId"
  | "correctOptionIds"
  | "matchingPairs"
  | "acceptedAnswers"
  | "explanation"
>;

export type StudentPublicQuiz = Omit<StudentQuiz, "questions"> & {
  difficulty?: StudentDifficulty;
  questions: readonly StudentPublicQuestion[];
};

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

export type StudentProblemGrade = {
  problemId: string;
  total: number;
  rubric: readonly StudentProblemRubricScore[];
  needsSourceVerification: boolean;
  feedback: string;
  evaluation: StudentProblemEvaluation;
};

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
