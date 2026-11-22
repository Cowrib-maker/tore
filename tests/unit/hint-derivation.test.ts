import { describe, expect, it } from "vitest";

import { deriveNextHint } from "@/domain/student/hint-derivation";
import { buildRubricFromLegalTest } from "@/domain/student/rubric-from-legal-test";
import type { ElementFeedback, Hint } from "@/domain/student/written-exam-types";
import { fixtureWrittenExamTest } from "./helpers/written-exam-fixtures";

function feedbackFor(elementId: string, status: ElementFeedback["status"]): ElementFeedback {
  return { elementId, label: elementId, status, explanation: "", provenance: [] };
}

describe("deriveNextHint", () => {
  it("picks the earliest-ordered required, unsatisfied, unhinted element", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const feedback = [
      feedbackFor("fixture:element:alpha", "NOT_SATISFIED"),
      feedbackFor("fixture:element:beta", "NOT_SATISFIED"),
    ];
    const hint = deriveNextHint(rubric, feedback, []);
    expect(hint?.elementId).toBe("fixture:element:alpha");
  });

  it("skips an already-satisfied element", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const feedback = [
      feedbackFor("fixture:element:alpha", "SATISFIED"),
      feedbackFor("fixture:element:beta", "NOT_SATISFIED"),
    ];
    const hint = deriveNextHint(rubric, feedback, []);
    expect(hint?.elementId).toBe("fixture:element:beta");
  });

  it("skips an element that already had a hint revealed", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const feedback = [
      feedbackFor("fixture:element:alpha", "NOT_SATISFIED"),
      feedbackFor("fixture:element:beta", "NOT_SATISFIED"),
    ];
    const alreadyRevealed: Hint[] = [
      { elementId: "fixture:element:alpha", label: "x", text: "y", provenance: [] },
    ];
    const hint = deriveNextHint(rubric, feedback, alreadyRevealed);
    expect(hint?.elementId).toBe("fixture:element:beta");
  });

  it("returns null once every required element is satisfied or hinted", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const feedback = [
      feedbackFor("fixture:element:alpha", "SATISFIED"),
      feedbackFor("fixture:element:beta", "SATISFIED"),
    ];
    expect(deriveNextHint(rubric, feedback, [])).toBeNull();
  });

  it("never reveals the full element description — only a bounded partial reveal", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const element = rubric.find((r) => r.elementId === "fixture:element:alpha")!;
    const feedback = [feedbackFor("fixture:element:alpha", "NOT_SATISFIED")];
    const hint = deriveNextHint(rubric, feedback, []);
    expect(hint).not.toBeNull();
    expect(hint!.text.length).toBeLessThan(element.description.length + 20);
    expect(hint!.text.startsWith("Санамж:")).toBe(true);
  });

  it("is derived only from a predefined element's own description, never fabricated text", () => {
    const rubric = buildRubricFromLegalTest(fixtureWrittenExamTest());
    const element = rubric.find((r) => r.elementId === "fixture:element:beta")!;
    const feedback = [
      feedbackFor("fixture:element:alpha", "SATISFIED"),
      feedbackFor("fixture:element:beta", "NOT_SATISFIED"),
    ];
    const hint = deriveNextHint(rubric, feedback, []);
    const firstClause = element.description.split(/(?<=[.!?])\s/)[0]!;
    expect(hint!.text).toContain(firstClause.length > 140 ? firstClause.slice(0, 20) : firstClause);
  });
});
