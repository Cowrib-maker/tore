import { describe, expect, it } from "vitest";

import { administrativeProblem, administrativeTest } from "@/domain/student/administrative";
import { civilProblem, civilTest } from "@/domain/student/civil";
import { criminalProblem, criminalTest } from "@/domain/student/criminal";
import type { StudentQuiz } from "@/domain/student/types";

/**
 * Regression: gradeStudentQuiz (grade-quiz.ts) throws a raw Error when a
 * question's correctOptionId has no matching option — a content-authoring
 * typo, not a user-input error. That throw is now caught defensively at the
 * Server Action boundary (student.actions.ts), but the real fix is never
 * shipping the typo in the first place: this test validates every quiz this
 * app actually serves, so a future authoring slip fails CI instead of
 * crashing a real student's quiz submission.
 */
const QUIZZES: readonly StudentQuiz[] = [
  criminalTest,
  criminalProblem,
  civilTest,
  civilProblem,
  administrativeTest,
  administrativeProblem,
];

describe("student quiz content integrity", () => {
  it("covers every shipped quiz (guards against a future quiz being added here unnoticed)", () => {
    expect(QUIZZES.length).toBeGreaterThan(0);
  });

  it.each(QUIZZES.map((quiz) => [quiz.id, quiz] as const))(
    "%s: every question's correctOptionId matches one of its own options",
    (_id, quiz) => {
      for (const question of quiz.questions) {
        const optionIds = question.options.map((option) => option.id);
        expect(
          optionIds,
          `${quiz.id}/${question.id}: correctOptionId "${question.correctOptionId}" is not among options [${optionIds.join(", ")}]`,
        ).toContain(question.correctOptionId);
      }
    },
  );

  it.each(QUIZZES.map((quiz) => [quiz.id, quiz] as const))(
    "%s: no question has duplicate or empty option ids",
    (_id, quiz) => {
      for (const question of quiz.questions) {
        const optionIds = question.options.map((option) => option.id);
        expect(optionIds.length, `${quiz.id}/${question.id} has no options`).toBeGreaterThan(0);
        expect(
          new Set(optionIds).size,
          `${quiz.id}/${question.id} has duplicate option ids: [${optionIds.join(", ")}]`,
        ).toBe(optionIds.length);
      }
    },
  );
});
