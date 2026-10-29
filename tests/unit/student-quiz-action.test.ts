import { afterEach, describe, expect, it, vi } from "vitest";

const gradeStudentQuizUseCase = vi.fn();

vi.mock("@/application/use-cases/student/grade-quiz", () => ({
  gradeStudentQuizUseCase: (...args: unknown[]) => gradeStudentQuizUseCase(...args),
}));

import { gradeStudentQuizAction } from "@/application/actions/student.actions";

/**
 * Regression for gradeStudentQuiz's raw throw on malformed quiz content
 * (a correctOptionId with no matching option) — see
 * tests/unit/student-quiz-content.test.ts for the content-validation half
 * of this fix. This half proves the Server Action itself never lets that
 * exception escape uncaught: it must surface as a normal, typed error
 * result, exactly like every other failure path this action has.
 */
afterEach(() => {
  gradeStudentQuizUseCase.mockReset();
});

describe("gradeStudentQuizAction", () => {
  it("rejects malformed input before calling the use case", async () => {
    const result = await gradeStudentQuizAction({
      quizId: "",
      answers: {},
    });
    expect(result).toEqual({ error: "invalid" });
    expect(gradeStudentQuizUseCase).not.toHaveBeenCalled();
  });

  it("returns not_found when the use case reports it", async () => {
    gradeStudentQuizUseCase.mockReturnValue({ error: "not_found" });
    const result = await gradeStudentQuizAction({
      quizId: "unknown-quiz",
      answers: {},
    });
    expect(result).toEqual({ error: "not_found" });
  });

  it("returns the grade on success", async () => {
    const grade = { quizId: "q1", total: 1, correct: 1, missed: 0, percent: 100, band: "excellent", reviews: [] };
    gradeStudentQuizUseCase.mockReturnValue(grade);
    const result = await gradeStudentQuizAction({
      quizId: "q1",
      answers: { "q1-1": "a" },
    });
    expect(result).toEqual(grade);
  });

  it("catches a thrown error (malformed quiz content) and returns a safe, typed error instead of propagating", async () => {
    gradeStudentQuizUseCase.mockImplementation(() => {
      throw new Error("Quiz q1 question q1-1 has no correct option");
    });
    const result = await gradeStudentQuizAction({
      quizId: "q1",
      answers: {},
    });
    expect(result).toEqual({ error: "grading_failed" });
  });
});
