import { gradeStudentQuiz, getStudentQuiz } from "@/domain/student";
import type { StudentQuizGrade } from "@/domain/student";

export function gradeStudentQuizUseCase(
  quizId: string,
  answers: Readonly<Record<string, string>>,
): StudentQuizGrade | { error: "not_found" } {
  const quiz = getStudentQuiz(quizId.trim());
  if (!quiz) {
    return { error: "not_found" };
  }
  return gradeStudentQuiz(quiz, answers);
}
