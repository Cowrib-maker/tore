import { describe, expect, it } from "vitest";

import {
  gradeStudentQuiz,
  getPublicTrackQuiz,
  getStudentQuiz,
  parseStudentDifficulty,
  parseStudentQuizKind,
  parseStudentTrackId,
  publicStudentQuiz,
  StudentTrackId,
} from "@/domain/student";

describe("student quiz grading", () => {
  it("scores correct, missed, and unanswered questions", () => {
    const quiz = getStudentQuiz("criminal-test");
    expect(quiz).not.toBeNull();
    if (!quiz) return;

    const first = quiz.questions[0]!;
    const second = quiz.questions[1]!;
    const wrong = first.options.find((o) => o.id !== first.correctOptionId)!;

    const grade = gradeStudentQuiz(quiz, {
      [first.id]: first.correctOptionId!,
      [second.id]: wrong.id,
    });

    expect(grade.total).toBe(quiz.questions.length);
    expect(grade.correct).toBe(1);
    expect(grade.missed).toBe(quiz.questions.length - 1);
    expect(grade.percent).toBe(
      Math.round((1 / quiz.questions.length) * 100),
    );
    expect(grade.reviews.find((r) => r.questionId === first.id)?.correct).toBe(
      true,
    );
    expect(grade.reviews.find((r) => r.questionId === second.id)?.correct).toBe(
      false,
    );

    const unanswered = grade.reviews.find(
      (r) => r.questionId !== first.id && r.questionId !== second.id,
    );
    expect(unanswered?.chosenOptionId).toBeNull();
    expect(unanswered?.correct).toBe(false);
    expect(unanswered?.correctLabel.length).toBeGreaterThan(0);
  });

  it("strips correct answers from the public quiz payload", () => {
    const quiz = getStudentQuiz("civil-problem");
    expect(quiz).not.toBeNull();
    if (!quiz) return;

    const published = publicStudentQuiz(quiz);
    expect(published.questions).toHaveLength(quiz.questions.length);
    for (const question of published.questions) {
      expect(question).not.toHaveProperty("correctOptionId");
      expect(question).not.toHaveProperty("explanation");
      expect(question.options.length).toBeGreaterThan(1);
    }
  });

  it("exposes public track quizzes for each branch", () => {
    for (const trackId of [
      StudentTrackId.CRIMINAL,
      StudentTrackId.CIVIL,
      StudentTrackId.ADMINISTRATIVE,
    ]) {
      expect(getPublicTrackQuiz(trackId, "test")?.kind).toBe("test");
      expect(getPublicTrackQuiz(trackId, "problem")?.kind).toBe("problem");
    }
  });

  it("parses track and quiz kind route params", () => {
    expect(parseStudentTrackId("criminal")).toBe("criminal");
    expect(parseStudentTrackId("nope")).toBeNull();
    expect(parseStudentQuizKind("test")).toBe("test");
    expect(parseStudentQuizKind("problem")).toBe("problem");
    expect(parseStudentQuizKind("exam")).toBeNull();
    expect(parseStudentDifficulty("expert")).toBe("expert");
    expect(parseStudentDifficulty("unknown")).toBe("medium");
  });
});
