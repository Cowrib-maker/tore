import { describe, expect, it } from "vitest";

import {
  buildRubricFromLegalTest,
  maxWrittenExamRubricTotal,
} from "@/domain/student/rubric-from-legal-test";
import { fixtureWrittenExamTest } from "./helpers/written-exam-fixtures";

describe("buildRubricFromLegalTest", () => {
  it("produces exactly one rubric item per LegalElement, preserving id/label/description/provenance", () => {
    const test = fixtureWrittenExamTest();
    const rubric = buildRubricFromLegalTest(test);

    expect(rubric).toHaveLength(test.elements.length);
    rubric.forEach((item, index) => {
      const element = test.elements[index]!;
      expect(item.elementId).toBe(element.id);
      expect(item.label).toBe(element.label);
      expect(item.description).toBe(element.description);
      expect(item.required).toBe(element.required);
      expect(item.provenance).toBe(element.provenance);
    });
  });

  it("never invents a criterion not present in the LegalTest", () => {
    const test = fixtureWrittenExamTest();
    const rubric = buildRubricFromLegalTest(test);
    const rubricIds = new Set(rubric.map((r) => r.elementId));
    const elementIds = new Set(test.elements.map((e) => e.id));
    expect(rubricIds).toEqual(elementIds);
  });

  it("distributes weights to sum exactly to 100 by default", () => {
    const test = fixtureWrittenExamTest();
    const rubric = buildRubricFromLegalTest(test);
    expect(maxWrittenExamRubricTotal(rubric)).toBe(100);
  });

  it("distributes weights to sum exactly to 100 for an odd element count", () => {
    const test = fixtureWrittenExamTest();
    test.elements.push({
      ...test.elements[0]!,
      id: "fixture:element:gamma",
      order: 3,
    });
    const rubric = buildRubricFromLegalTest(test);
    expect(rubric).toHaveLength(3);
    expect(maxWrittenExamRubricTotal(rubric)).toBe(100);
  });

  it("supports a caller-supplied weightFor without changing element identity", () => {
    const test = fixtureWrittenExamTest();
    const rubric = buildRubricFromLegalTest(test, {
      weightFor: (element) => (element.id === "fixture:element:alpha" ? 70 : 30),
    });
    expect(maxWrittenExamRubricTotal(rubric)).toBe(100);
    expect(rubric.find((r) => r.elementId === "fixture:element:alpha")?.weight).toBe(70);
  });

  it("returns an empty rubric for a test with no elements, never throwing", () => {
    const test = fixtureWrittenExamTest();
    test.elements = [];
    expect(buildRubricFromLegalTest(test)).toEqual([]);
  });

  it("sorts rubric items by element order regardless of input order", () => {
    const test = fixtureWrittenExamTest();
    test.elements.reverse();
    const rubric = buildRubricFromLegalTest(test);
    expect(rubric.map((r) => r.elementId)).toEqual([
      "fixture:element:alpha",
      "fixture:element:beta",
    ]);
  });
});
