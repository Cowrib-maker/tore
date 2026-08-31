import type { StudentGradeBand, StudentQuiz, StudentQuizGrade } from "./types";

export function gradeBandFromPercent(percent: number): StudentGradeBand {
  if (percent >= 90) return "excellent";
  if (percent >= 80) return "good";
  if (percent >= 70) return "average";
  if (percent >= 60) return "pass";
  return "fail";
}

export function publicStudentQuiz(quiz: StudentQuiz) {
  return {
    id: quiz.id,
    trackId: quiz.trackId,
    kind: quiz.kind,
    title: quiz.title,
    intro: quiz.intro,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      factPattern: question.factPattern,
      options: question.options,
    })),
  };
}

/**
 * Scores a submitted quiz. Unknown question ids are ignored.
 * Unanswered questions count as missed. Does not invent a correct option.
 */
export function gradeStudentQuiz(
  quiz: StudentQuiz,
  answers: Readonly<Record<string, string>>,
): StudentQuizGrade {
  const reviews = quiz.questions.map((question) => {
    const chosenOptionId = answers[question.id]?.trim() || null;
    const chosen = question.options.find((option) => option.id === chosenOptionId);
    const correct = question.options.find(
      (option) => option.id === question.correctOptionId,
    );
    if (!correct) {
      throw new Error(`Quiz ${quiz.id} question ${question.id} has no correct option`);
    }
    const isCorrect = chosenOptionId === question.correctOptionId;
    return {
      questionId: question.id,
      prompt: question.prompt,
      factPattern: question.factPattern,
      chosenOptionId,
      chosenLabel: chosen?.label ?? null,
      correctOptionId: question.correctOptionId,
      correctLabel: correct.label,
      explanation: question.explanation,
      correct: isCorrect,
    };
  });

  const total = reviews.length;
  const correct = reviews.filter((item) => item.correct).length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);

  return {
    quizId: quiz.id,
    total,
    correct,
    missed: total - correct,
    percent,
    band: gradeBandFromPercent(percent),
    reviews,
  };
}
