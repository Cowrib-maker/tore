import { describe, expect, it } from "vitest";

import {
  ADMISSIBILITY_CONDITIONAL_ELEMENTS,
  ADMISSIBILITY_MANDATORY_ELEMENTS,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  EmptyRuleRetriever,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  SourceBackedAdministrativeDoctrineFramework,
  SubsumptionMatchStatus,
  analyzeAdministrativeCase,
  createCaseAnalysisOrchestrator,
  type AdministrativeAdmissibilityResult,
} from "@/engine/doctrine";
import type { LegalEvidence, LegalFact } from "@/engine/doctrine";
import {
  APPLICABLE_AT,
  CASE1_ADMISSIBILITY_EVIDENCE,
  CASE1_ADMISSIBILITY_FACTS,
  CASE2_ADMISSIBILITY_EVIDENCE,
  CASE2_ADMISSIBILITY_FACTS,
  MICRO1_PARDON_EVIDENCE,
  MICRO1_PARDON_FACTS,
  MICRO2_MP_POLICE_EVIDENCE,
  MICRO2_MP_POLICE_FACTS,
} from "./helpers/administrative-fixtures";

/**
 * "Тогтоох хэсэг" — ЗХШХШтХ §54.1 (p.6-12).
 *
 * Exercised exclusively through `analyzeAdministrativeCase` — the
 * internal admissibility check is not exported (final pre-commit gate:
 * analyzeAdministrativeCase is the ONLY public administrative entry
 * point, so tests must not reach around it either).
 *
 * Applicability semantics (final gate review): §54.1.2-54.1.8 are
 * case-dependent by INCLUSION in the checked element array, never by a
 * `required: false` flag or a subsumption status. `required` stays pure
 * structural metadata; NOT_EVALUATED means "no mapping supplied", not
 * "not applicable to this dispute" — verified against
 * evaluateElementMappings's own semantics in fact-element-mapping.ts.
 */
function buildOrchestrator() {
  const classifier = new RuleBasedLegalDomainClassifier();
  return createCaseAnalysisOrchestrator({
    issueSpotter: new RuleBasedIssueSpotter(classifier),
    ruleRetriever: new EmptyRuleRetriever(),
    classifier,
    criminalFramework: new EmptyCriminalDoctrineFramework(),
    civilFramework: new EmptyCivilDoctrineFramework(),
    administrativeFramework: new SourceBackedAdministrativeDoctrineFramework(),
  });
}

async function checkAdmissibility(request: {
  facts: readonly LegalFact[];
  evidence: readonly LegalEvidence[];
  applicableAt: string;
  conditionalAdmissibilityElementIds?: readonly string[];
}): Promise<AdministrativeAdmissibilityResult> {
  const result = await analyzeAdministrativeCase(
    {
      ...request,
      merits: {
        facts: request.facts,
        evidence: request.evidence,
        applicableAt: request.applicableAt,
      },
    },
    buildOrchestrator(),
  );
  return result.admissibility;
}

describe("Admissibility catalog structure (p.6-12)", () => {
  it("has exactly the 4 mandatory §54.1.1 sub-questions", () => {
    expect(ADMISSIBILITY_MANDATORY_ELEMENTS.map((e) => e.id)).toEqual([
      "administrative:admissibility:1.1-legal-dispute",
      "administrative:admissibility:1.2-public-law-dispute",
      "administrative:admissibility:1.3-not-constitutional-court",
      "administrative:admissibility:1.4-not-other-court",
    ]);
  });

  it("has exactly the 7 conditional §54.1.2-54.1.8 items", () => {
    expect(ADMISSIBILITY_CONDITIONAL_ELEMENTS.map((e) => e.id)).toEqual([
      "administrative:admissibility:54.1.2-venue",
      "administrative:admissibility:54.1.3-prior-procedure",
      "administrative:admissibility:54.1.4-capacity",
      "administrative:admissibility:54.1.5-standing",
      "administrative:admissibility:54.1.6-no-prior-judgment",
      "administrative:admissibility:54.1.7-succession",
      "administrative:admissibility:54.1.8-deadline",
    ]);
  });

  it("conditional elements not requested are absent from the checked test entirely (not NOT_EVALUATED-by-default)", async () => {
    const result = await checkAdmissibility({
      facts: CASE1_ADMISSIBILITY_FACTS,
      evidence: CASE1_ADMISSIBILITY_EVIDENCE,
      applicableAt: APPLICABLE_AT,
      // no conditionalAdmissibilityElementIds supplied
    });
    expect(result.test.elements).toHaveLength(4);
    expect(
      result.test.elements.some((e) => e.id.startsWith("administrative:admissibility:54.1.")),
    ).toBe(false);
  });

  it("requesting a conditional element without facts yields NOT_EVALUATED (genuine data gap, distinct from non-applicability)", async () => {
    const result = await checkAdmissibility({
      facts: CASE1_ADMISSIBILITY_FACTS,
      evidence: CASE1_ADMISSIBILITY_EVIDENCE,
      applicableAt: APPLICABLE_AT,
      conditionalAdmissibilityElementIds: [
        "administrative:admissibility:54.1.6-no-prior-judgment",
      ],
    });
    const application = result.subsumption.applications.find(
      (a) => a.element.id === "administrative:admissibility:54.1.6-no-prior-judgment",
    );
    expect(application?.result).toBe(SubsumptionMatchStatus.NOT_EVALUATED);
    expect(application?.explanation).toBe("No mapping to this element.");
    // Because it's required and unmapped, admissibility correctly fails —
    // this is the "we asked but have no data" case, not "not applicable".
    expect(result.admissible).toBe(false);
  });
});

describe("Admissibility — Case 1 (p.17-20)", () => {
  it("passes all 4 mandatory sub-questions", async () => {
    const result = await checkAdmissibility({
      facts: CASE1_ADMISSIBILITY_FACTS,
      evidence: CASE1_ADMISSIBILITY_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    expect(result.admissible).toBe(true);
    expect(result.rejectionReason).toBeNull();
  });
});

describe("Admissibility — Case 2 (p.24-27)", () => {
  it("passes all 4 mandatory sub-questions", async () => {
    const result = await checkAdmissibility({
      facts: CASE2_ADMISSIBILITY_FACTS,
      evidence: CASE2_ADMISSIBILITY_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    expect(result.admissible).toBe(true);
    expect(result.rejectionReason).toBeNull();
  });
});

describe("Admissibility — micro-example 1: presidential pardon (p.8)", () => {
  it("fails at 1.1 — not a legal dispute (Ерөнхийлөгчийн бvрэн эрх, шалгуургvй)", async () => {
    const result = await checkAdmissibility({
      facts: MICRO1_PARDON_FACTS,
      evidence: MICRO1_PARDON_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    expect(result.admissible).toBe(false);
    expect(result.rejectionReason).toContain("Эрх зvйн маргаан мөн үү?");
  });
});

describe("Admissibility — micro-example 2: MP / police officer (p.8-9)", () => {
  it("passes 1.1-1.3 (public-law dispute, not a Constitutional Court matter) but fails 1.4 (criminal-court jurisdiction)", async () => {
    const result = await checkAdmissibility({
      facts: MICRO2_MP_POLICE_FACTS,
      evidence: MICRO2_MP_POLICE_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    });
    const byId = new Map(result.subsumption.applications.map((a) => [a.element.id, a.result]));
    expect(byId.get("administrative:admissibility:1.1-legal-dispute")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:admissibility:1.2-public-law-dispute")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:admissibility:1.3-not-constitutional-court")).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(byId.get("administrative:admissibility:1.4-not-other-court")).toBe(
      SubsumptionMatchStatus.NOT_SATISFIED,
    );
    expect(result.admissible).toBe(false);
    expect(result.rejectionReason).toContain("Бусад шvvхийн маргаан биш байх");
  });
});
