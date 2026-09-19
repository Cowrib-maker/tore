import { describe, expect, it } from "vitest";

import {
  COMPETENCE_CONCEPT,
  DefaultSubsumptionEngine,
  DeterministicFactElementMapper,
  FORMAL_LEGALITY_CATEGORIES,
  FORMAL_LEGALITY_ELEMENTS,
  SubsumptionMatchStatus,
  createFormalLegalityTest,
} from "@/engine/doctrine";
import {
  APPLICABLE_AT,
  CASE1_FORMAL_EVIDENCE,
  CASE1_FORMAL_FACTS,
  CASE2_FORMAL_EVIDENCE,
  CASE2_FORMAL_FACTS,
} from "./helpers/administrative-fixtures";

/**
 * Формал эрх зvйн шаардлага — 4 canonical items (p.13-14). "Эрх хэмжээ"
 * is 3 separate LegalElement values sharing one LegalConcept via
 * conceptId (architecture decision from the final gate review) — not a
 * parent/child structure, since LegalElement has no such field.
 */
describe("Formal legality — canonical catalog (p.13-14)", () => {
  it("has 6 elements: 3 competence sub-dimensions + procedure + form + participation", () => {
    expect(FORMAL_LEGALITY_ELEMENTS.map((e) => e.id)).toEqual([
      "administrative:formal:1a-territory",
      "administrative:formal:1b-function",
      "administrative:formal:1c-hierarchy",
      "administrative:formal:2-decision-procedure",
      "administrative:formal:3-form",
      "administrative:formal:4-participation",
    ]);
  });

  it("groups the 3 competence sub-dimensions under one shared LegalConcept (conceptId)", () => {
    const competenceElements = FORMAL_LEGALITY_ELEMENTS.slice(0, 3);
    expect(competenceElements.every((e) => e.conceptId === COMPETENCE_CONCEPT.id)).toBe(
      true,
    );
    expect(FORMAL_LEGALITY_ELEMENTS.slice(3).every((e) => e.conceptId === null)).toBe(
      true,
    );
  });

  it("has exactly 4 categories whose element ids total 6, matching the source's own numbering (p.13-14)", () => {
    expect(FORMAL_LEGALITY_CATEGORIES.map((c) => c.id)).toEqual([
      "competence",
      "procedure",
      "form",
      "participation",
    ]);
    const allElementIds = FORMAL_LEGALITY_CATEGORIES.flatMap((c) => c.elementIds);
    expect(allElementIds).toHaveLength(6);
    expect(allElementIds.sort()).toEqual(
      FORMAL_LEGALITY_ELEMENTS.map((e) => e.id).sort(),
    );
    const competence = FORMAL_LEGALITY_CATEGORIES.find((c) => c.id === "competence");
    expect(competence?.elementIds).toHaveLength(3);
  });
});

describe("Formal legality — Case 1 (реached: competence, procedure, form; p.21-22)", () => {
  it("all reached items SATISFIED; item 4 (participation) simply excluded, not asserted", () => {
    // Case 1's own text never reaches "бусад этгээдийн оролцоо" — the
    // case-curated test omits it entirely rather than forcing a status.
    const test = createFormalLegalityTest(FORMAL_LEGALITY_ELEMENTS.slice(0, 5));
    expect(test.elements.map((e) => e.id)).not.toContain(
      "administrative:formal:4-participation",
    );

    const mapper = new DeterministicFactElementMapper();
    const { mappings } = mapper.map({
      facts: CASE1_FORMAL_FACTS,
      elements: test.elements,
      evidence: CASE1_FORMAL_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    const engine = new DefaultSubsumptionEngine();
    const result = engine.apply({
      legalTest: test,
      facts: CASE1_FORMAL_FACTS,
      evidence: CASE1_FORMAL_EVIDENCE,
      mappings,
    });

    expect(result.allRequiredSatisfied).toBe(true);
    expect(
      result.applications.every((a) => a.result === SubsumptionMatchStatus.SATISFIED),
    ).toBe(true);
  });
});

describe("Formal legality — Case 2 (all 4 items reached; p.30-31)", () => {
  it("competence, form, participation SATISFIED; procedure NOT_SATISFIED (p.31, p.33)", () => {
    const test = createFormalLegalityTest();
    const mapper = new DeterministicFactElementMapper();
    const { mappings } = mapper.map({
      facts: CASE2_FORMAL_FACTS,
      elements: test.elements,
      evidence: CASE2_FORMAL_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    const engine = new DefaultSubsumptionEngine();
    const result = engine.apply({
      legalTest: test,
      facts: CASE2_FORMAL_FACTS,
      evidence: CASE2_FORMAL_EVIDENCE,
      mappings,
    });

    const byId = new Map(result.applications.map((a) => [a.element.id, a.result]));
    expect(byId.get("administrative:formal:1a-territory")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:formal:1b-function")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:formal:1c-hierarchy")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:formal:2-decision-procedure")).toBe(
      SubsumptionMatchStatus.NOT_SATISFIED,
    );
    expect(byId.get("administrative:formal:3-form")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:formal:4-participation")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );

    // The source's own holding for Case 2: formal test overall FAILS
    // because of the procedure defect (p.33: "шийдвэр гаргах
    // ажиллагааны алдаатай").
    expect(result.allRequiredSatisfied).toBe(false);
  });
});
