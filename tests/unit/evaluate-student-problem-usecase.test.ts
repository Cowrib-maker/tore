import { describe, expect, it, vi } from "vitest";

import {
  evaluateStudentProblemUseCase,
  STUDENT_PROBLEM_ANSWER_MAX_CHARS,
  STUDENT_PROBLEM_ANSWER_MIN_CHARS,
} from "@/application/use-cases/student/evaluate-student-problem";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";

function stubCompletion(): LegalAiCompletionPort {
  return {
    isConfigured: () => false,
    complete: vi.fn(),
  };
}

const LONG_ENOUGH_ANSWER = "Энэ бол шалгуулах хариулт. ".repeat(5);

describe("evaluateStudentProblemUseCase", () => {
  it("returns error: not_found for an unknown problem id", async () => {
    const result = await evaluateStudentProblemUseCase("no-such-problem", LONG_ENOUGH_ANSWER, {
      completion: stubCompletion(),
    });
    expect(result).toEqual({ error: "not_found" });
  });

  it("returns error: too_short below the minimum answer length", async () => {
    const result = await evaluateStudentProblemUseCase(
      "civil-case-study-1",
      "хэт",
      { completion: stubCompletion() },
    );
    expect(result).toEqual({ error: "too_short" });
  });

  it("returns error: too_long above the maximum answer length", async () => {
    const tooLong = "а".repeat(STUDENT_PROBLEM_ANSWER_MAX_CHARS + 1);
    const result = await evaluateStudentProblemUseCase("civil-case-study-1", tooLong, {
      completion: stubCompletion(),
    });
    expect(result).toEqual({ error: "too_long" });
  });

  it("trims whitespace before validating length", async () => {
    const paddedShort = "  " + "а".repeat(STUDENT_PROBLEM_ANSWER_MIN_CHARS - 1) + "  ";
    const result = await evaluateStudentProblemUseCase("civil-case-study-1", paddedShort, {
      completion: stubCompletion(),
    });
    expect(result).toEqual({ error: "too_short" });
  });

  it("grades a valid submission via the structural fallback when the completion port is unconfigured", async () => {
    const result = await evaluateStudentProblemUseCase(
      "civil-case-study-1",
      LONG_ENOUGH_ANSWER,
      { completion: stubCompletion() },
    );
    if ("error" in result) {
      throw new Error(`expected a grade, got error: ${result.error}`);
    }
    expect(result.problemId).toBe("civil-case-study-1");
    expect(result.evaluation.mode).toBe("fallback");
  });

  it("looks up the problem by trimmed id", async () => {
    const result = await evaluateStudentProblemUseCase(
      "  civil-case-study-1  ",
      LONG_ENOUGH_ANSWER,
      { completion: stubCompletion() },
    );
    expect("error" in result).toBe(false);
  });
});
