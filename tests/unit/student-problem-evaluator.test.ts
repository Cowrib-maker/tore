import { describe, expect, it, vi } from "vitest";

import {
  evaluateStudentProblem,
  evaluateStudentProblemWithAi,
} from "@/application/ai/student-problem-evaluator";
import { findStudentLegalProblemById } from "@/domain/student/legal-problems";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";

const problem = findStudentLegalProblemById("civil-case-study-1")!;

function completionReturning(content: string, model = "gpt-5.6-luna"): LegalAiCompletionPort {
  return {
    isConfigured: () => true,
    complete: vi.fn(async () => ({
      content,
      model,
      provider: "OPENAI" as const,
      inputTokens: 100,
      outputTokens: 50,
    })),
  };
}

function unconfiguredCompletion(): LegalAiCompletionPort {
  return {
    isConfigured: () => false,
    complete: vi.fn(async () => {
      throw new Error("should never be called when unconfigured");
    }),
  };
}

const VALID_AI_JSON = JSON.stringify({
  rubricSatisfied: {
    issue: true,
    applicableLaw: false,
    legalReasoning: true,
    facts: true,
    conclusion: false,
  },
  strengths: ["Асуудлыг зөв тодорхойлсон."],
  weaknesses: ["Дүгнэлт сул байна."],
  missingIssues: ["Дүгнэлт"],
  missingProvisions: ["Хамаарах зүйл дурдаагүй."],
  suggestions: ["Дүгнэлтээ илүү тодорхой бич."],
  sourceIntegrityNote: "Зүйл дурдаагүй тул тусгай нягталгаа шаардлагагүй.",
  needsSourceVerification: false,
});

describe("evaluateStudentProblemWithAi", () => {
  it("returns null without calling the model when the completion port is not configured", async () => {
    const completion = unconfiguredCompletion();
    const result = await evaluateStudentProblemWithAi(problem, "хариулт", completion);
    expect(result).toBeNull();
  });

  it("parses a well-formed JSON response into a StudentProblemGrade with mode: ai", async () => {
    const completion = completionReturning(VALID_AI_JSON);
    const result = await evaluateStudentProblemWithAi(problem, "хариулт", completion);
    expect(result).not.toBeNull();
    expect(result!.evaluation.mode).toBe("ai");
    expect(result!.evaluation.model).toBe("gpt-5.6-luna");
    expect(result!.problemId).toBe(problem.id);
    expect(result!.maxTotal).toBe(100);

    const byId = Object.fromEntries(result!.rubric.map((item) => [item.id, item]));
    expect(byId.issue.satisfied).toBe(true);
    expect(byId.issue.score).toBe(byId.issue.weight);
    expect(byId.applicableLaw.satisfied).toBe(false);
    expect(byId.applicableLaw.score).toBe(0);
    expect(result!.total).toBe(
      byId.issue.weight + byId.legalReasoning.weight + byId.facts.weight,
    );
  });

  it("strips ```json code fences before parsing", async () => {
    const fenced = "```json\n" + VALID_AI_JSON + "\n```";
    const completion = completionReturning(fenced);
    const result = await evaluateStudentProblemWithAi(problem, "хариулт", completion);
    expect(result).not.toBeNull();
    expect(result!.evaluation.mode).toBe("ai");
  });

  it("returns null when the model response is not valid JSON", async () => {
    const completion = completionReturning("энэ бол зүгээр текст, JSON биш");
    const result = await evaluateStudentProblemWithAi(problem, "хариулт", completion);
    expect(result).toBeNull();
  });

  it("returns null when required fields are missing from the JSON", async () => {
    const incomplete = JSON.stringify({ strengths: ["x"] });
    const completion = completionReturning(incomplete);
    const result = await evaluateStudentProblemWithAi(problem, "хариулт", completion);
    expect(result).toBeNull();
  });

  it("returns null (never throws) when the completion port itself throws", async () => {
    const throwingCompletion: LegalAiCompletionPort = {
      isConfigured: () => true,
      complete: vi.fn(async () => {
        throw new Error("network error");
      }),
    };
    const result = await evaluateStudentProblemWithAi(problem, "хариулт", throwingCompletion);
    expect(result).toBeNull();
  });

  it("forces needsSourceVerification to true whenever the student's own answer cites an article number, regardless of what the model said", async () => {
    const jsonSayingNoVerificationNeeded = JSON.stringify({
      rubricSatisfied: { issue: true, applicableLaw: true, legalReasoning: true, facts: true, conclusion: true },
      strengths: [],
      weaknesses: [],
      missingIssues: [],
      missingProvisions: [],
      suggestions: [],
      sourceIntegrityNote: "Бүх зүйл зөв.",
      needsSourceVerification: false,
    });
    const completion = completionReturning(jsonSayingNoVerificationNeeded);
    const result = await evaluateStudentProblemWithAi(
      problem,
      "Иргэний хуулийн 15.2 зүйлийг баримт болгон дүгнэлт гаргалаа.",
      completion,
    );
    expect(result).not.toBeNull();
    expect(result!.needsSourceVerification).toBe(true);
    expect(result!.evaluation.sourceIntegrityNote).toContain("нягтлах");
  });
});

describe("evaluateStudentProblem", () => {
  it("uses the AI result when the AI evaluator succeeds", async () => {
    const completion = completionReturning(VALID_AI_JSON);
    const grade = await evaluateStudentProblem(problem, "хариулт", completion);
    expect(grade.evaluation.mode).toBe("ai");
  });

  it("falls back to the structural grader when the AI evaluator returns null", async () => {
    const completion = unconfiguredCompletion();
    const grade = await evaluateStudentProblem(problem, "хариулт", completion);
    expect(grade.evaluation.mode).toBe("fallback");
    expect(grade.problemId).toBe(problem.id);
  });

  it("falls back to the structural grader when the model call throws", async () => {
    const throwingCompletion: LegalAiCompletionPort = {
      isConfigured: () => true,
      complete: vi.fn(async () => {
        throw new Error("timeout");
      }),
    };
    const grade = await evaluateStudentProblem(problem, "хариулт", throwingCompletion);
    expect(grade.evaluation.mode).toBe("fallback");
  });
});
