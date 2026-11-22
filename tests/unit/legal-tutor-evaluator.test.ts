import { describe, expect, it, vi } from "vitest";

import {
  buildElementFeedback,
  computeDimensions,
  dimensionForElementId,
  evaluateWithTutor,
} from "@/application/ai/legal-tutor-evaluator";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import type { ElementApplication } from "@/engine/doctrine";
import { buildRubricFromLegalTest } from "@/domain/student/rubric-from-legal-test";
import { fixtureWrittenExamTest } from "./helpers/written-exam-fixtures";

function completionReturning(content: string, model = "gpt-5.6-luna"): LegalAiCompletionPort {
  return {
    isConfigured: () => true,
    complete: vi.fn(async () => ({
      content,
      model,
      provider: "OPENAI" as const,
      inputTokens: 10,
      outputTokens: 10,
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

function application(
  elementId: string,
  result: ElementApplication["result"],
  explanation = "тайлбар",
): ElementApplication {
  const test = fixtureWrittenExamTest();
  const element = test.elements.find((e) => e.id === elementId)!;
  return {
    element,
    supportingFactIds: [],
    supportingEvidenceIds: [],
    counterEvidenceIds: [],
    mappingIds: [],
    result,
    explanation,
  };
}

describe("dimensionForElementId", () => {
  it("maps known administrative prefixes to their presentation dimension", () => {
    expect(dimensionForElementId("administrative:admissibility:1.1-legal-dispute")).toBe("issueSpotting");
    expect(dimensionForElementId("administrative:act:1-issuing-body")).toBe("authoritySelection");
    expect(dimensionForElementId("administrative:formal:1a-territory")).toBe("methodology");
    expect(dimensionForElementId("administrative:substantive:1-legal-basis")).toBe("subsumption");
  });

  it("falls back to methodology for an unrecognized elementId, never throwing", () => {
    expect(dimensionForElementId("fixture:element:alpha")).toBe("methodology");
  });
});

describe("buildElementFeedback", () => {
  it("reshapes ElementApplication[] into ElementFeedback[] without changing the status", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const applications = [application("fixture:element:alpha", "SATISFIED")];
    const feedback = buildElementFeedback(applications, rubric);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.status).toBe("SATISFIED");
    expect(feedback[0]!.elementId).toBe("fixture:element:alpha");
  });
});

describe("computeDimensions", () => {
  it("marks a dimension strong when all its elements are satisfied", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const applications = [
      application("fixture:element:alpha", "SATISFIED"),
      application("fixture:element:beta", "SATISFIED"),
    ];
    const feedback = buildElementFeedback(applications, rubric);
    const dims = computeDimensions(feedback, "... дvгнэлт: тийм.");
    expect(dims.methodology.status).toBe("strong");
    expect(dims.conclusion.status).toBe("strong");
  });

  it("marks conclusion missing when the answer has no conclusion signal", () => {
    const dims = computeDimensions([], "дуусаагvй хариулт");
    expect(dims.conclusion.status).toBe("missing");
  });
});

describe("evaluateWithTutor", () => {
  const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());

  it("returns mode: fallback with an honest, non-invented narrative when unconfigured", async () => {
    const applications = [
      application("fixture:element:alpha", "SATISFIED"),
      application("fixture:element:beta", "NOT_SATISFIED"),
    ];
    const result = await evaluateWithTutor({
      answer: "хариулт",
      problemTitle: "Fixture",
      rubric,
      applications,
      completion: unconfiguredCompletion(),
    });
    expect(result.mode).toBe("fallback");
    expect(result.model).toBeUndefined();
    expect(result.elementFeedback.find((f) => f.elementId === "fixture:element:beta")?.status).toBe(
      "NOT_SATISFIED",
    );
  });

  it("never lets the AI narrative change an element's status — only its explanation text", async () => {
    const applications = [application("fixture:element:alpha", "NOT_SATISFIED")];
    const aiJson = JSON.stringify({
      overallFeedback: "Ерөнхий тайлбар.",
      explanationByElementId: {
        "fixture:element:alpha": "AI-гийн дэлгэрэнгvй тайлбар — гэхдээ vр дvнг өөрчлөхгvй.",
      },
    });
    const result = await evaluateWithTutor({
      answer: "хариулт",
      problemTitle: "Fixture",
      rubric,
      applications,
      completion: completionReturning(aiJson),
    });
    expect(result.mode).toBe("ai");
    expect(result.model).toBe("gpt-5.6-luna");
    // Status still NOT_SATISFIED — the AI only reworded the explanation.
    expect(result.elementFeedback[0]!.status).toBe("NOT_SATISFIED");
    expect(result.elementFeedback[0]!.explanation).toContain("AI-гийн дэлгэрэнгvй тайлбар");
  });

  it("falls back honestly (mode: fallback) when the AI response is not valid JSON", async () => {
    const applications = [application("fixture:element:alpha", "SATISFIED")];
    const result = await evaluateWithTutor({
      answer: "хариулт",
      problemTitle: "Fixture",
      rubric,
      applications,
      completion: completionReturning("текст, JSON биш"),
    });
    expect(result.mode).toBe("fallback");
  });

  it("falls back honestly when the completion port throws", async () => {
    const throwing: LegalAiCompletionPort = {
      isConfigured: () => true,
      complete: vi.fn(async () => {
        throw new Error("network error");
      }),
    };
    const applications = [application("fixture:element:alpha", "SATISFIED")];
    const result = await evaluateWithTutor({
      answer: "хариулт",
      problemTitle: "Fixture",
      rubric,
      applications,
      completion: throwing,
    });
    expect(result.mode).toBe("fallback");
  });

  it("sets needsSourceVerification when the student answer cites an article number", async () => {
    const applications = [application("fixture:element:alpha", "SATISFIED")];
    const result = await evaluateWithTutor({
      answer: "Энэ нь 12 дугаар зvйлд заасны дагуу зөв.",
      problemTitle: "Fixture",
      rubric,
      applications,
      completion: unconfiguredCompletion(),
    });
    expect(result.needsSourceVerification).toBe(true);
  });

  it("returns a schema-complete TutorEvaluation with all five dimensions and element feedback", async () => {
    const applications = [
      application("fixture:element:alpha", "SATISFIED"),
      application("fixture:element:beta", "NOT_SATISFIED"),
    ];
    const result = await evaluateWithTutor({
      answer: "хариулт",
      problemTitle: "Fixture",
      rubric,
      applications,
      completion: unconfiguredCompletion(),
    });
    expect(result).toMatchObject({
      mode: "fallback",
      issueSpotting: expect.any(Object),
      authoritySelection: expect.any(Object),
      methodology: expect.any(Object),
      subsumption: expect.any(Object),
      conclusion: expect.any(Object),
    });
    expect(Array.isArray(result.elementFeedback)).toBe(true);
    expect(Array.isArray(result.hints)).toBe(true);
    expect(typeof result.overallFeedback).toBe("string");
  });

  it("produces a hint list derived only from unsatisfied required elements", async () => {
    const applications = [
      application("fixture:element:alpha", "SATISFIED"),
      application("fixture:element:beta", "NOT_SATISFIED"),
    ];
    const result = await evaluateWithTutor({
      answer: "хариулт",
      problemTitle: "Fixture",
      rubric,
      applications,
      completion: unconfiguredCompletion(),
    });
    expect(result.hints).toHaveLength(1);
    expect(result.hints[0]).toContain("Санамж:");
  });
});
