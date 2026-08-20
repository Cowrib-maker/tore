import { describe, expect, it } from "vitest";

import {
  LegalAuthorityKind,
  LegalConflictKind,
  LegalDomain,
  LegalReasoningStepKind,
  createDoctrineConflict,
  createDoctrineEngine,
  createSourceConflict,
  createUnresolvedIssueConflict,
  emptyTemporal,
  evaluateSourceBackedSupport,
  aiInferenceProvenance,
  type LegalConclusion,
  type LegalDoctrine,
  type LegalInterpretation,
  type LegalIssue,
  type LegalReasoningRequest,
  type LegalRule,
  type LegalTest,
} from "@/engine/doctrine";

function scholarlyProvenance(sourceId: string) {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.DOCTRINE,
    citation: `Fixture treatise ${sourceId}`,
    locator: "§1",
  };
}

function positiveLawProvenance(sourceId: string) {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.POSITIVE_LAW,
    citation: `Fixture statute ${sourceId}`,
    locator: "art. 1",
  };
}

function fixtureIssue(overrides: Partial<LegalIssue> = {}): LegalIssue {
  return {
    id: "issue:fixture-1",
    statement: "Whether the criminal actus reus element is satisfied",
    domain: LegalDomain.CRIMINAL,
    classification: {
      domain: LegalDomain.CRIMINAL,
      topics: ["criminal"],
      nature: "SUBSTANTIVE",
      confidence: 0.6,
    },
    temporal: emptyTemporal({ applicableAt: "2024-01-01" }),
    provenance: [scholarlyProvenance("fixture:issue-source")],
    unresolved: false,
    ...overrides,
  };
}

function fixtureDoctrine(): LegalDoctrine {
  return {
    id: "doctrine:fixture-1",
    name: "Fixture elements doctrine",
    statement: "A test doctrine statement for unit tests only.",
    domain: LegalDomain.CRIMINAL,
    relatedPositiveLawIds: ["law:fixture"],
    relatedCourtDecisionIds: [],
    concepts: [],
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: null,
      sourceVersion: "fixture-v1",
      applicableAt: "2024-01-01",
    }),
    provenance: [scholarlyProvenance("fixture:treatise-1")],
  };
}

function fixtureRule(): LegalRule {
  return {
    id: "rule:fixture-1",
    statement: "Fixture legal rule statement.",
    doctrineId: "doctrine:fixture-1",
    positiveLawRef: "law:fixture#art-1",
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      sourceVersion: "fixture-v1",
      applicableAt: "2024-01-01",
    }),
    provenance: [positiveLawProvenance("fixture:statute-1")],
  };
}

function fixtureTest(): LegalTest {
  return {
    id: "test:fixture-1",
    name: "Fixture two-element test",
    doctrineId: "doctrine:fixture-1",
    ruleId: "rule:fixture-1",
    elements: [
      {
        id: "el:1",
        label: "Element A",
        description: "First element",
        required: true,
        order: 1,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: [scholarlyProvenance("fixture:treatise-1")],
      },
      {
        id: "el:2",
        label: "Element B",
        description: "Second element",
        required: true,
        order: 2,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: [scholarlyProvenance("fixture:treatise-1")],
      },
    ],
    temporal: emptyTemporal({ sourceVersion: "fixture-v1" }),
    provenance: [scholarlyProvenance("fixture:treatise-1")],
  };
}

function fixtureInterpretation(): LegalInterpretation {
  return {
    id: "interp:fixture-1",
    subjectId: "rule:fixture-1",
    subjectKind: "legal_rule",
    statement: "Fixture interpretation of the rule.",
    temporal: emptyTemporal({ sourceVersion: "fixture-v1" }),
    provenance: [scholarlyProvenance("fixture:commentary-1")],
  };
}

function fixtureConclusion(
  overrides: Partial<LegalConclusion> = {},
): LegalConclusion {
  return {
    id: "conclusion:fixture-1",
    issueId: "issue:fixture-1",
    statement: "Element A is satisfied on the supplied facts.",
    accepted: false,
    temporal: emptyTemporal({ applicableAt: "2024-01-01" }),
    provenance: [
      scholarlyProvenance("fixture:treatise-1"),
      positiveLawProvenance("fixture:statute-1"),
    ],
    llmGeneratedAlone: false,
    ...overrides,
  };
}

function supportedRequest(
  overrides: Partial<LegalReasoningRequest> = {},
): LegalReasoningRequest {
  return {
    issue: fixtureIssue(),
    applicableDoctrine: fixtureDoctrine(),
    legalRule: fixtureRule(),
    legalTest: fixtureTest(),
    facts: [
      {
        id: "fact:1",
        statement: "Fact for element A",
        elementId: "el:1",
        disputed: false,
      },
      {
        id: "fact:2",
        statement: "Fact for element B",
        elementId: "el:2",
        disputed: false,
      },
    ],
    evidence: [
      {
        id: "ev:1",
        factId: "fact:1",
        description: "Exhibit 1",
        sourceId: "exhibit:1",
      },
      {
        id: "ev:2",
        factId: "fact:2",
        description: "Exhibit 2",
        sourceId: "exhibit:2",
      },
    ],
    interpretation: fixtureInterpretation(),
    proposedConclusion: fixtureConclusion(),
    applicableAt: "2024-06-01",
    ...overrides,
  };
}

describe("Legal Doctrine foundation", () => {
  it("keeps the default doctrine repository empty (no invented corpus)", () => {
    const engine = createDoctrineEngine();
    expect(engine.getRepository().listDoctrines()).toEqual([]);
    expect(engine.criminalFramework.identifyIssues({
      facts: [],
      temporal: emptyTemporal(),
    }).issues).toEqual([]);
    expect(engine.civilFramework.domain).toBe("CIVIL");
    expect(engine.administrativeFramework.domain).toBe("ADMINISTRATIVE");
  });

  it("classifies issues without inventing doctrine content", () => {
    const engine = createDoctrineEngine();
    const issue = engine.draftIssue({
      statement: "Is this a criminal offence under the code?",
    });
    expect(issue.domain).toBe(LegalDomain.CRIMINAL);
    expect(issue.unresolved).toBe(true);
    expect(issue.provenance).toEqual([]);
  });

  it("distinguishes doctrine provenance from AI inference", () => {
    const backed = evaluateSourceBackedSupport("doctrine", [
      scholarlyProvenance("t-1"),
    ]);
    expect(backed.status).toBe("SOURCE_BACKED");
    expect(backed.llmGeneratedAlone).toBe(false);

    const aiOnly = evaluateSourceBackedSupport("conclusion", [
      aiInferenceProvenance(),
    ]);
    expect(aiOnly.status).toBe("UNSUPPORTED");
    expect(aiOnly.llmGeneratedAlone).toBe(true);
  });

  it("builds the full reasoning trace in required order", () => {
    const engine = createDoctrineEngine();
    const result = engine.reason(supportedRequest());
    expect(result.trace.steps.map((s) => s.kind)).toEqual([
      LegalReasoningStepKind.ISSUE,
      LegalReasoningStepKind.APPLICABLE_DOCTRINE,
      LegalReasoningStepKind.LEGAL_RULE,
      LegalReasoningStepKind.ELEMENTS,
      LegalReasoningStepKind.FACTS,
      LegalReasoningStepKind.EVIDENCE,
      LegalReasoningStepKind.SUBSUMPTION,
      LegalReasoningStepKind.CONCLUSION,
    ]);
    expect(result.trace.temporal.applicableAt).toBe("2024-06-01");
    expect(result.trace.temporal.sourceVersion).toBe("fixture-v1");
    expect(result.validation.ok).toBe(true);
    expect(result.conclusion?.accepted).toBe(true);
    expect(result.support.allRequiredSupported).toBe(true);
  });

  it("rejects a legal conclusion that is solely LLM-generated", () => {
    const engine = createDoctrineEngine();
    const result = engine.reason(
      supportedRequest({
        proposedConclusion: fixtureConclusion({
          llmGeneratedAlone: true,
          provenance: [aiInferenceProvenance()],
        }),
      }),
    );
    expect(result.validation.ok).toBe(false);
    expect(result.conclusion).toBeNull();
    expect(result.validation.rejected.some((r) => r.includes("llm_only"))).toBe(
      true,
    );
    expect(result.support.conclusion.llmGeneratedAlone).toBe(true);
  });

  it("rejects conclusions lacking source-backed legal rule / doctrine / interpretation", () => {
    const engine = createDoctrineEngine();
    const result = engine.reason(
      supportedRequest({
        legalRule: {
          ...fixtureRule(),
          provenance: [aiInferenceProvenance("llm:rule")],
        },
        applicableDoctrine: {
          ...fixtureDoctrine(),
          provenance: [],
        },
        interpretation: {
          ...fixtureInterpretation(),
          provenance: [aiInferenceProvenance("llm:interp")],
        },
        proposedConclusion: fixtureConclusion({
          provenance: [aiInferenceProvenance("llm:conclusion")],
        }),
      }),
    );
    expect(result.validation.ok).toBe(false);
    expect(result.conclusion).toBeNull();
    expect(result.validation.rejected).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unsupported_conclusion/),
        expect.stringMatching(/unsupported_legal_rule/),
        expect.stringMatching(/unsupported_doctrine/),
        expect.stringMatching(/unsupported_interpretation/),
      ]),
    );
  });

  it("flags incomplete reasoning when facts or evidence are missing", () => {
    const engine = createDoctrineEngine();
    const result = engine.reason(
      supportedRequest({
        facts: [],
        evidence: [],
        proposedConclusion: null,
      }),
    );
    const factStep = result.trace.steps.find(
      (s) => s.kind === LegalReasoningStepKind.FACTS,
    );
    const evidenceStep = result.trace.steps.find(
      (s) => s.kind === LegalReasoningStepKind.EVIDENCE,
    );
    expect(factStep?.status).toBe("INCOMPLETE");
    expect(evidenceStep?.status).toBe("INCOMPLETE");
    expect(result.conclusion).toBeNull();
  });

  it("represents source, doctrine, and unresolved-issue conflicts", () => {
    const conflicts = [
      createSourceConflict({
        id: "c-source",
        description: "Two sources disagree on the rule",
        subjectIds: ["rule:fixture-1"],
        conflictingProvenance: [
          positiveLawProvenance("a"),
          scholarlyProvenance("b"),
        ],
      }),
      createDoctrineConflict({
        id: "c-doctrine",
        description: "Two doctrines conflict",
        subjectIds: ["doctrine:fixture-1", "doctrine:fixture-2"],
      }),
      createUnresolvedIssueConflict({
        id: "c-issue",
        description: "Issue remains open",
        issueId: "issue:fixture-1",
      }),
    ];
    expect(conflicts.map((c) => c.kind)).toEqual([
      LegalConflictKind.SOURCE_CONFLICT,
      LegalConflictKind.DOCTRINE_CONFLICT,
      LegalConflictKind.UNRESOLVED_ISSUE,
    ]);
    expect(conflicts.every((c) => c.unresolved)).toBe(true);

    const engine = createDoctrineEngine();
    const result = engine.reason(supportedRequest({ conflicts }));
    expect(result.validation.ok).toBe(false);
    expect(result.conclusion).toBeNull();
    expect(result.validation.rejected.some((r) => r.includes("c-source"))).toBe(
      true,
    );
  });

  it("marks doctrine outside temporal window as incomplete support", () => {
    const engine = createDoctrineEngine();
    const result = engine.reason(
      supportedRequest({
        applicableDoctrine: {
          ...fixtureDoctrine(),
          temporal: emptyTemporal({
            validFrom: "2020-01-01",
            validTo: "2021-01-01",
            sourceVersion: "old",
          }),
        },
        applicableAt: "2024-06-01",
      }),
    );
    expect(result.support.doctrine.status).toBe("INCOMPLETE");
    expect(result.validation.ok).toBe(false);
    expect(result.conclusion).toBeNull();
  });

  it("does not accept a conclusion for an unresolved issue", () => {
    const engine = createDoctrineEngine();
    const result = engine.reason(
      supportedRequest({
        issue: fixtureIssue({ unresolved: true }),
      }),
    );
    expect(result.validation.ok).toBe(false);
    expect(result.conclusion).toBeNull();
    expect(result.validation.rejected).toContain(
      "unresolved_issue:cannot_accept_conclusion",
    );
  });
});
