import { administrativeLessons, administrativeProblem, administrativeTest } from "./administrative";
import { civilLessons, civilProblem, civilTest } from "./civil";
import { criminalLessons, criminalProblem, criminalTest } from "./criminal";
import { publicStudentQuiz } from "./grade-quiz";
import {
  isStudentQuizKind,
  isStudentTrackId,
  type StudentLesson,
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

export function getStudentQuiz(quizId: string): StudentQuiz | null {
  return QUIZZES.find((quiz) => quiz.id === quizId) ?? null;
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
  kind: StudentQuizKind,
): StudentPublicQuiz | null {
  const quiz = getTrackQuiz(trackId, kind);
  return quiz ? publicStudentQuiz(quiz) : null;
}

export function parseStudentTrackId(value: string): StudentTrackId | null {
  return isStudentTrackId(value) ? value : null;
}

export function parseStudentQuizKind(value: string): StudentQuizKind | null {
  return isStudentQuizKind(value) ? value : null;
}

export {
  STUDENT_QUIZ_KINDS,
  STUDENT_TRACK_IDS,
  StudentTrackId,
  isStudentQuizKind,
  isStudentTrackId,
} from "./types";
export type {
  StudentGradeBand,
  StudentLesson,
  StudentPublicQuiz,
  StudentQuestionReview,
  StudentQuiz,
  StudentQuizGrade,
  StudentQuizKind,
  StudentTrackId as StudentTrackIdType,
} from "./types";
export { gradeBandFromPercent, gradeStudentQuiz, publicStudentQuiz } from "./grade-quiz";
