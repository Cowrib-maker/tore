import type {
  StudentQuestionReview,
  StudentQuiz,
  StudentQuizGrade,
} from "./types";

export function gradeBandFromPercent(percent: number): StudentQuizGrade["band"] {
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
      type: question.type,
      difficulty: question.difficulty,
      prompt: question.prompt,
      factPattern: question.factPattern,
      options: question.options,
      matchingOptions: question.matchingOptions,
    })),
  };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function answerLabels(quiz: StudentQuiz, questionIndex: number, answer: string) {
  const question = quiz.questions[questionIndex]!;
  if (question.type === "matching") return answer || null;
  if (question.type === "short-answer") return answer || null;
  return answer
    .split(",")
    .map((id) => question.options.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label))
    .join(", ") || null;
}

function gradeQuestion(quiz: StudentQuiz, questionIndex: number, answer: string) {
  const question = quiz.questions[questionIndex]!;
  const type = question.type ?? "single";
  const selected = answer.trim();

  if (type === "multiple") {
    const selectedIds = selected.split(",").filter(Boolean).sort();
    const correctIds = [...(question.correctOptionIds ?? [])].sort();
    return (
      selectedIds.length === correctIds.length &&
      selectedIds.every((id, index) => id === correctIds[index])
    );
  }

  if (type === "matching") {
    const selectedPairs = new Map(
      selected
        .split(",")
        .map((pair) => pair.split(":", 2))
        .filter((pair): pair is [string, string] => pair.length === 2),
    );
    return (
      selectedPairs.size === question.matchingPairs?.length &&
      question.matchingPairs?.every(
        (pair) => selectedPairs.get(pair.left) === pair.right,
      )
    );
  }

  if (type === "short-answer") {
    return question.acceptedAnswers?.some(
      (accepted) => normalize(selected) === normalize(accepted),
    ) ?? false;
  }

  return selected === question.correctOptionId;
}

function correctLabel(quiz: StudentQuiz, questionIndex: number): string {
  const question = quiz.questions[questionIndex]!;
  const type = question.type ?? "single";
  if (type === "multiple") {
    return (question.correctOptionIds ?? [])
      .map((id) => question.options.find((option) => option.id === id)?.label)
      .filter((label): label is string => Boolean(label))
      .join(", ");
  }
  if (type === "matching") {
    return (question.matchingPairs ?? [])
      .map((pair) => `${pair.left} → ${pair.right}`)
      .join(", ");
  }
  if (type === "short-answer") return question.acceptedAnswers?.[0] ?? "";
  return (
    question.options.find((option) => option.id === question.correctOptionId)
      ?.label ?? ""
  );
}

/**
 * Scores a submitted test locally. It accepts only answer identifiers and never
 * uses a guessed legal rule or article reference to decide correctness.
 */
export function gradeStudentQuiz(
  quiz: StudentQuiz,
  answers: Readonly<Record<string, string>>,
): StudentQuizGrade {
  const reviews: StudentQuestionReview[] = quiz.questions.map(
    (question, index) => {
      const answer = answers[question.id] ?? "";
      const isCorrect = gradeQuestion(quiz, index, answer);
      return {
        questionId: question.id,
        prompt: question.prompt,
        factPattern: question.factPattern,
        chosenOptionId: answer.trim() || null,
        chosenLabel: answerLabels(quiz, index, answer),
        correctOptionId: question.correctOptionId ?? "",
        correctLabel: correctLabel(quiz, index),
        explanation: question.explanation,
        correct: isCorrect,
      };
    },
  );

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
