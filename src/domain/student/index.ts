import {
  getStudentProblem as buildStudentProblem,
  getTheoryCourseContent,
} from "./content";
import { administrativeLessons, administrativeProblem, administrativeTest } from "./administrative";
import { civilLessons, civilProblem, civilTest } from "./civil";
import { criminalLessons, criminalProblem, criminalTest } from "./criminal";
import { generateOriginalStudentQuestions } from "./generate-test";
import { publicStudentQuiz } from "./grade-quiz";
import {
  isStudentDifficulty,
  isStudentQuizKind,
  isStudentTrackId,
  type StudentDifficulty,
  type StudentLesson,
  type StudentLegalProblem,
  type StudentPublicQuiz,
  type StudentQuiz,
  type StudentQuizKind,
  type StudentTrackId,
} from "./types";

const LESSONS: readonly StudentLesson[] = [
  ...criminalLessons,
  ...civilLessons,
  ...administrativeLessons,
];

const QUIZZES: readonly StudentQuiz[] = [
  criminalTest,
  criminalProblem,
  civilTest,
  civilProblem,
  administrativeTest,
  administrativeProblem,
];

export function listStudentLessons(
  trackId: StudentTrackId,
  kind?: StudentLesson["kind"],
): StudentLesson[] {
  return LESSONS.filter(
    (lesson) =>
      lesson.trackId === trackId && (kind == null || lesson.kind === kind),
  );
}

export function getStudentLesson(
  trackId: StudentTrackId,
  lessonId: string,
): StudentLesson | null {
  return (
    LESSONS.find(
      (lesson) => lesson.trackId === trackId && lesson.id === lessonId,
    ) ?? null
  );
}

export function getStudentTheoryCourse(
  trackId: StudentTrackId,
  lessonId: string,
) {
  const lesson = getStudentLesson(trackId, lessonId);
  return lesson ? getTheoryCourseContent(lesson) : null;
}

export function getStudentQuiz(quizId: string): StudentQuiz | null {
  const [baseQuizId, rawDifficulty] = quizId.split(":", 2);
  const quiz = QUIZZES.find((item) => item.id === baseQuizId) ?? null;
  if (!quiz || quiz.kind !== "test" || !rawDifficulty) return quiz;
  if (!isStudentDifficulty(rawDifficulty)) return null;
  return {
    ...quiz,
    id: quizId,
    questions: generateOriginalStudentQuestions(quiz.trackId, rawDifficulty),
  };
}

export function getTrackQuiz(
  trackId: StudentTrackId,
  kind: StudentQuizKind,
): StudentQuiz | null {
  return (
    QUIZZES.find((quiz) => quiz.trackId === trackId && quiz.kind === kind) ??
    null
  );
}

export function getPublicTrackQuiz(
  trackId: StudentTrackId,
  kind: "test",
  difficulty?: StudentDifficulty,
): StudentPublicQuiz | null;
export function getPublicTrackQuiz(
  trackId: StudentTrackId,
  kind: "problem",
): StudentPublicQuiz | null;
export function getPublicTrackQuiz(
  trackId: StudentTrackId,
  kind: StudentQuizKind,
  difficulty: StudentDifficulty = "medium",
): StudentPublicQuiz | null {
  const quiz = getTrackQuiz(trackId, kind);
  if (!quiz) return null;
  if (kind === "test") {
    const generated = getStudentQuiz(`${quiz.id}:${difficulty}`);
    return generated
      ? { ...publicStudentQuiz(generated), difficulty }
      : null;
  }
  return publicStudentQuiz(quiz);
}

export function getStudentProblem(trackId: StudentTrackId): StudentLegalProblem {
  return buildStudentProblem(trackId);
}

export function parseStudentTrackId(value: string): StudentTrackId | null {
  return isStudentTrackId(value) ? value : null;
}

export function parseStudentQuizKind(value: string): StudentQuizKind | null {
  return isStudentQuizKind(value) ? value : null;
}

export function parseStudentDifficulty(value: string | undefined): StudentDifficulty {
  return value && isStudentDifficulty(value) ? value : "medium";
}

export {
  STUDENT_DIFFICULTIES,
  STUDENT_QUIZ_KINDS,
  STUDENT_TRACK_IDS,
  StudentTrackId,
  isStudentDifficulty,
  isStudentQuizKind,
  isStudentTrackId,
} from "./types";
export type {
  StudentDifficulty,
  StudentGradeBand,
  StudentQuizGrade,
  StudentLegalProblem,
  StudentLegalSource,
  StudentLesson,
  StudentProblemGrade,
  StudentProblemEvaluation,
  StudentPublicQuiz,
  StudentQuestionReview,
  StudentQuiz,
  StudentQuizKind,
  StudentTrackId as StudentTrackIdType,
} from "./types";
export {
  gradeBandFromPercent,
  gradeStudentQuiz,
  publicStudentQuiz,
} from "./grade-quiz";
export { gradeStudentProblem } from "./grade-problem";
export { generateOriginalStudentQuestions } from "./generate-test";
