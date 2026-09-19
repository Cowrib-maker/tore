import { describe, expect, it } from "vitest";

import {
  DefaultSubsumptionEngine,
  DeterministicFactElementMapper,
  SUBSTANTIVE_LEGALITY_ELEMENTS,
  SubsumptionMatchStatus,
  createSubstantiveLegalityTest,
} from "@/engine/doctrine";
import {
  APPLICABLE_AT,
  CASE1_SUBSTANTIVE_EVIDENCE,
  CASE1_SUBSTANTIVE_FACTS,
  CASE2_SUBSTANTIVE_EVIDENCE,
  CASE2_SUBSTANTIVE_FACTS,
} from "./helpers/administrative-fixtures";

/**
 * Материаллаг эрх зvйн шаардлага — 3 canonical items (p.14-16).
 * "Эрх зvйн vндэслэлтэй байх" stays ONE LegalElement — its two dimensions
 * (хvчин төгöлдöр / зöв хэрэглэсэн) are preserved via two provenance
 * entries, not split into siblings (final gate review decision).
 */
describe("Substantive legality — canonical catalog (p.14-16)", () => {
  it("has exactly 3 elements", () => {
    expect(SUBSTANTIVE_LEGALITY_ELEMENTS.map((e) => e.id)).toEqual([
      "administrative:substantive:1-legal-basis",
      "administrative:substantive:2-content-clarity",
      "administrative:substantive:3-discretion",
    ]);
  });

  it("legal-basis element carries provenance for both source dimensions", () => {
    const legalBasis = SUBSTANTIVE_LEGALITY_ELEMENTS[0]!;
    expect(legalBasis.provenance).toHaveLength(2);
    expect(legalBasis.provenance.map((p) => p.locator)).toEqual(["х.14-15", "х.15"]);
    expect(legalBasis.description).toContain("Хvчин төгöлдöр эсэх");
    expect(legalBasis.description).toContain("Зöв хэрэглэсэн эсэх");
  });
});

describe("Substantive legality — Case 1 (p.22-23)", () => {
  it("legal-basis NOT_SATISFIED (misapplied law), clarity SATISFIED, discretion not reached", () => {
    // Case 1's text never raises a discretion issue — excluded from the
    // case-curated test, not forced to a status.
    const test = createSubstantiveLegalityTest(
      SUBSTANTIVE_LEGALITY_ELEMENTS.slice(0, 2),
    );
    const mapper = new DeterministicFactElementMapper();
    const { mappings } = mapper.map({
      facts: CASE1_SUBSTANTIVE_FACTS,
      elements: test.elements,
      evidence: CASE1_SUBSTANTIVE_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    const engine = new DefaultSubsumptionEngine();
    const result = engine.apply({
      legalTest: test,
      facts: CASE1_SUBSTANTIVE_FACTS,
      evidence: CASE1_SUBSTANTIVE_EVIDENCE,
      mappings,
    });

    const byId = new Map(result.applications.map((a) => [a.element.id, a.result]));
    expect(byId.get("administrative:substantive:1-legal-basis")).toBe(
      SubsumptionMatchStatus.NOT_SATISFIED,
    );
    expect(byId.get("administrative:substantive:2-content-clarity")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    // Source conclusion (p.23): "материаллаг эрх зvйн алдаатай ... хууль
    // зvйн vндэслэлгvй."
    expect(result.allRequiredSatisfied).toBe(false);
  });
});

describe("Substantive legality — Case 2 (p.32)", () => {
  it("legal-basis and discretion NOT_SATISFIED, clarity SATISFIED", () => {
    const test = createSubstantiveLegalityTest();
    const mapper = new DeterministicFactElementMapper();
    const { mappings } = mapper.map({
      facts: CASE2_SUBSTANTIVE_FACTS,
      elements: test.elements,
      evidence: CASE2_SUBSTANTIVE_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    const engine = new DefaultSubsumptionEngine();
    const result = engine.apply({
      legalTest: test,
      facts: CASE2_SUBSTANTIVE_FACTS,
      evidence: CASE2_SUBSTANTIVE_EVIDENCE,
      mappings,
    });

    const byId = new Map(result.applications.map((a) => [a.element.id, a.result]));
    expect(byId.get("administrative:substantive:1-legal-basis")).toBe(
      SubsumptionMatchStatus.NOT_SATISFIED,
    );
    expect(byId.get("administrative:substantive:2-content-clarity")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:substantive:3-discretion")).toBe(
      SubsumptionMatchStatus.NOT_SATISFIED,
    );
    expect(result.allRequiredSatisfied).toBe(false);
  });
});
