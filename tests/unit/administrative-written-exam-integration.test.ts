import { describe, expect, it } from "vitest";

import {
  DefaultSubsumptionEngine,
  DeterministicFactElementMapper,
} from "@/engine/doctrine";
import {
  buildAdministrativeMeritsLegalTest,
  buildAdministrativeWrittenExamProblem,
  buildCombinedAdministrativeLegalTest,
} from "@/domain/student/administrative-written-exam";
import { buildRubricFromLegalTest } from "@/domain/student/rubric-from-legal-test";
import { buildElementFeedback } from "@/application/ai/legal-tutor-evaluator";
import { groundAdministrativeWrittenExamReference } from "@/application/administrative/ground-written-exam-reference";
import {
  APPLICABLE_AT,
  CASE1_ACT_EVIDENCE,
  CASE1_ACT_FACTS,
  CASE1_ADMISSIBILITY_EVIDENCE,
  CASE1_ADMISSIBILITY_FACTS,
  CASE1_FORMAL_EVIDENCE,
  CASE1_FORMAL_FACTS,
  CASE1_SUBSTANTIVE_EVIDENCE,
  CASE1_SUBSTANTIVE_FACTS,
  CASE2_ACT_EVIDENCE,
  CASE2_ACT_FACTS,
  CASE2_ADMISSIBILITY_EVIDENCE,
  CASE2_ADMISSIBILITY_FACTS,
  CASE2_FORMAL_EVIDENCE,
  CASE2_FORMAL_FACTS,
  CASE2_SUBSTANTIVE_EVIDENCE,
  CASE2_SUBSTANTIVE_FACTS,
} from "./helpers/administrative-fixtures";

function runCase(facts: typeof CASE1_ACT_FACTS, evidence: typeof CASE1_ACT_EVIDENCE) {
  const legalTest = buildCombinedAdministrativeLegalTest();
  const mapper = new DeterministicFactElementMapper();
  const mapping = mapper.map({
    facts,
    elements: legalTest.elements,
    evidence,
    applicableAt: APPLICABLE_AT,
  });
  const engine = new DefaultSubsumptionEngine();
  return engine.apply({ legalTest, facts, evidence, mappings: mapping.mappings });
}

describe("Combined administrative LegalTest (req #8)", () => {
  it("has exactly 19 elements (4 admissibility + 6 act + 6 formal + 3 substantive) with unique ids", () => {
    const test = buildCombinedAdministrativeLegalTest();
    expect(test.elements).toHaveLength(19);
    const ids = new Set(test.elements.map((e) => e.id));
    expect(ids.size).toBe(19);
  });

  it("orders elements sequentially across the combined catalog", () => {
    const test = buildCombinedAdministrativeLegalTest();
    expect(test.elements.map((e) => e.order)).toEqual(
      Array.from({ length: 19 }, (_, i) => i + 1),
    );
  });

  it("derives the written-exam rubric with weights summing to 100 and no invented criteria", () => {
    const test = buildCombinedAdministrativeLegalTest();
    const rubric = buildRubricFromLegalTest(test);
    expect(rubric).toHaveLength(19);
    expect(rubric.reduce((sum, r) => sum + r.weight, 0)).toBe(100);
    const rubricIds = new Set(rubric.map((r) => r.elementId));
    const elementIds = new Set(test.elements.map((e) => e.id));
    expect(rubricIds).toEqual(elementIds);
  });

  it("preserves each element's source-backed provenance unchanged into the rubric", () => {
    const test = buildCombinedAdministrativeLegalTest();
    const rubric = buildRubricFromLegalTest(test);
    for (const item of rubric) {
      const element = test.elements.find((e) => e.id === item.elementId)!;
      expect(item.provenance).toBe(element.provenance);
      expect(item.provenance.length).toBeGreaterThan(0);
      expect(item.provenance[0]!.sourceKind).not.toBe("AI_INFERENCE");
    }
  });

  it("builds a WrittenExamProblem carrying the same case-study fact pattern as the legacy fixture", () => {
    const problem = buildAdministrativeWrittenExamProblem();
    expect(problem.trackId).toBe("administrative");
    expect(problem.rubric).toHaveLength(19);
    expect(problem.legalTest.elements).toHaveLength(19);
    expect(problem.factPattern).toContain("Ж-ийн худалдааны зөвшөөрлийг");
  });
});

describe("Administrative Case 1 (У компани) via DefaultSubsumptionEngine — unmodified kernel", () => {
  it("finds all admissibility elements SATISFIED", () => {
    const result = runCase(CASE1_ADMISSIBILITY_FACTS, CASE1_ADMISSIBILITY_EVIDENCE);
    const admissibility = result.applications.filter((a) => a.element.id.includes(":admissibility:"));
    expect(admissibility.every((a) => a.result === "SATISFIED")).toBe(true);
  });

  it("finds all act-classification elements SATISFIED", () => {
    const result = runCase(CASE1_ACT_FACTS, CASE1_ACT_EVIDENCE);
    const act = result.applications.filter((a) => a.element.id.includes(":act:"));
    expect(act.every((a) => a.result === "SATISFIED")).toBe(true);
  });

  it("finds the formal-legality elements it has facts for SATISFIED", () => {
    const result = runCase(CASE1_FORMAL_FACTS, CASE1_FORMAL_EVIDENCE);
    const mapped = new Set(CASE1_FORMAL_FACTS.map((f) => f.elementId));
    const formal = result.applications.filter((a) => mapped.has(a.element.id));
    expect(formal.every((a) => a.result === "SATISFIED")).toBe(true);
  });

  it("finds the substantive legal-basis element NOT_SATISFIED — the act misapplied the law", () => {
    const result = runCase(CASE1_SUBSTANTIVE_FACTS, CASE1_SUBSTANTIVE_EVIDENCE);
    const legalBasis = result.applications.find(
      (a) => a.element.id === "administrative:substantive:1-legal-basis",
    );
    expect(legalBasis?.result).toBe("NOT_SATISFIED");
  });
});

describe("Administrative Case 2 (Болд) via DefaultSubsumptionEngine — unmodified kernel", () => {
  it("finds all admissibility elements SATISFIED", () => {
    const result = runCase(CASE2_ADMISSIBILITY_FACTS, CASE2_ADMISSIBILITY_EVIDENCE);
    const admissibility = result.applications.filter((a) => a.element.id.includes(":admissibility:"));
    expect(admissibility.every((a) => a.result === "SATISFIED")).toBe(true);
  });

  it("finds all act-classification elements SATISFIED", () => {
    const result = runCase(CASE2_ACT_FACTS, CASE2_ACT_EVIDENCE);
    const act = result.applications.filter((a) => a.element.id.includes(":act:"));
    expect(act.every((a) => a.result === "SATISFIED")).toBe(true);
  });

  it("finds the decision-procedure formal element NOT_SATISFIED — the defect the case turns on", () => {
    const result = runCase(CASE2_FORMAL_FACTS, CASE2_FORMAL_EVIDENCE);
    const procedure = result.applications.find(
      (a) => a.element.id === "administrative:formal:2-decision-procedure",
    );
    expect(procedure?.result).toBe("NOT_SATISFIED");
  });

  it("finds both substantive defect elements NOT_SATISFIED", () => {
    const result = runCase(CASE2_SUBSTANTIVE_FACTS, CASE2_SUBSTANTIVE_EVIDENCE);
    const legalBasis = result.applications.find(
      (a) => a.element.id === "administrative:substantive:1-legal-basis",
    );
    const discretion = result.applications.find(
      (a) => a.element.id === "administrative:substantive:3-discretion",
    );
    expect(legalBasis?.result).toBe("NOT_SATISFIED");
    expect(discretion?.result).toBe("NOT_SATISFIED");
  });
});

describe("buildElementFeedback provenance preservation (req #4, #10)", () => {
  it("carries the element's DoctrineProvenance through to ElementFeedback unchanged", () => {
    const legalTest = buildCombinedAdministrativeLegalTest();
    const rubric = buildRubricFromLegalTest(legalTest);
    const result = runCase(CASE1_ADMISSIBILITY_FACTS, CASE1_ADMISSIBILITY_EVIDENCE);
    const relevant = result.applications.filter((a) => a.element.id.includes(":admissibility:"));
    const feedback = buildElementFeedback(relevant, rubric);
    for (const item of feedback) {
      expect(item.provenance.length).toBeGreaterThan(0);
      expect(item.provenance[0]!.sourceKind).toBe("DOCTRINE");
    }
  });
});

describe("groundAdministrativeWrittenExamReference — exercises analyzeAdministrativeCase() as grounding (req #8)", () => {
  it("is admissible and reaches merits using the real, unmodified administrative doctrine pipeline", async () => {
    const result = await groundAdministrativeWrittenExamReference();
    expect(result.admissible).toBe(true);
    expect(result.merits).not.toBeNull();
  });

  it("correctly flags the decision-procedure and content-clarity defects as NOT_SATISFIED", async () => {
    const result = await groundAdministrativeWrittenExamReference();
    expect(result.merits).not.toBeNull();
    const procedure = result.merits!.subsumption.applications.find(
      (a) => a.element.id === "administrative:formal:2-decision-procedure",
    );
    const clarity = result.merits!.subsumption.applications.find(
      (a) => a.element.id === "administrative:substantive:2-content-clarity",
    );
    expect(procedure?.result).toBe("NOT_SATISFIED");
    expect(clarity?.result).toBe("NOT_SATISFIED");
  });

  it("leaves elements the fact pattern never addresses as NOT_EVALUATED rather than guessing", async () => {
    const result = await groundAdministrativeWrittenExamReference();
    const discretion = result.merits!.subsumption.applications.find(
      (a) => a.element.id === "administrative:substantive:3-discretion",
    );
    expect(discretion?.result).toBe("NOT_EVALUATED");
  });
});

describe("buildAdministrativeMeritsLegalTest", () => {
  it("excludes admissibility elements — only act + formal + substantive (15 elements)", () => {
    const test = buildAdministrativeMeritsLegalTest();
    expect(test.elements).toHaveLength(15);
    expect(test.elements.some((e) => e.id.includes(":admissibility:"))).toBe(false);
  });
});
