import { describe, expect, it } from "vitest";

import {
  DefaultSubsumptionEngine,
  DeterministicFactElementMapper,
  SubsumptionMatchStatus,
  createActClassificationTest,
} from "@/engine/doctrine";
import {
  APPLICABLE_AT,
  CASE1_ACT_EVIDENCE,
  CASE1_ACT_FACTS,
  CASE2_ACT_EVIDENCE,
  CASE2_ACT_FACTS,
} from "./helpers/administrative-fixtures";

/**
 * ЗЕХ §37.1 — "захиргааны акт мөн эсэх" 6 шинж (p.10). Applied identically
 * in Case 1 (p.19-20) and Case 2 (p.29-30); both conclude "6 шинжийг
 * бvхэлд нь агуулж байх тул захиргааны акт мөн байна."
 */
describe("Act classification test — ЗЕХ §37.1 (p.10)", () => {
  it("has exactly the 6 source-listed features, ordered", () => {
    const test = createActClassificationTest("х.10");
    expect(test.elements.map((e) => e.id)).toEqual([
      "administrative:act:1-issuing-body",
      "administrative:act:2-definite-occasion",
      "administrative:act:3-public-law-scope",
      "administrative:act:4-outward-facing",
      "administrative:act:5-direct-legal-effect",
      "administrative:act:6-directive-measure",
    ]);
    expect(test.elements.every((e) => e.required)).toBe(true);
  });

  it("Case 1 (шийтгэлийн хуудас) satisfies all 6 features (p.19-20)", () => {
    const test = createActClassificationTest("х.19-20");
    const mapper = new DeterministicFactElementMapper();
    const { mappings } = mapper.map({
      facts: CASE1_ACT_FACTS,
      elements: test.elements,
      evidence: CASE1_ACT_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    const engine = new DefaultSubsumptionEngine();
    const result = engine.apply({
      legalTest: test,
      facts: CASE1_ACT_FACTS,
      evidence: CASE1_ACT_EVIDENCE,
      mappings,
    });

    expect(result.allRequiredSatisfied).toBe(true);
    expect(
      result.applications.every((a) => a.result === SubsumptionMatchStatus.SATISFIED),
    ).toBe(true);
  });

  it("Case 2 (Засаг даргын захирамж) satisfies all 6 features (p.29-30)", () => {
    const test = createActClassificationTest("х.29-30");
    const mapper = new DeterministicFactElementMapper();
    const { mappings } = mapper.map({
      facts: CASE2_ACT_FACTS,
      elements: test.elements,
      evidence: CASE2_ACT_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    const engine = new DefaultSubsumptionEngine();
    const result = engine.apply({
      legalTest: test,
      facts: CASE2_ACT_FACTS,
      evidence: CASE2_ACT_EVIDENCE,
      mappings,
    });

    expect(result.allRequiredSatisfied).toBe(true);
    expect(
      result.applications.every((a) => a.result === SubsumptionMatchStatus.SATISFIED),
    ).toBe(true);
  });
});
