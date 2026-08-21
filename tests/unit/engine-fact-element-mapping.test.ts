import { describe, expect, it } from "vitest";

import {
  ConclusionDisposition,
  DeterministicFactElementMapper,
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  FactElementRelation,
  InMemoryRuleRetriever,
  LegalAuthorityKind,
  LegalDomain,
  MappingConfidence,
  MappingMethod,
  ReasoningSupportStatus,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  SubsumptionMatchStatus,
  buildCaseAnalysisReview,
  createCaseAnalysisOrchestrator,
  emptyTemporal,
  evaluateElementMappings,
  mappingIsAdequate,
  type LegalElement,
  type LegalFact,
  type LegalIssue,
  type LegalRule,
  type LegalTest,
  type RetrievedLegalRule,
} from "@/engine/doctrine";

function element(
  id: string,
  description: string,
  order: number,
  temporal = emptyTemporal({ validFrom: "2020-01-01", applicableAt: "2024-06-01" }),
): LegalElement {
  return {
    id,
    label: description.slice(0, 40),
    description,
    required: true,
    order,
    conceptId: null,
    temporal,
    provenance: [
      {
        sourceId: "statute",
        sourceKind: LegalAuthorityKind.POSITIVE_LAW,
        citation: "art. 1",
        locator: id,
      },
    ],
  };
}

function fact(
  id: string,
  statement: string,
  extra: Partial<LegalFact> = {},
): LegalFact {
  return {
    id,
    statement,
    elementId: extra.elementId ?? null,
    disputed: extra.disputed ?? false,
    ...extra,
  };
}

const transfer = element("el:transfer", "property was transferred", 1);
const mapper = new DeterministicFactElementMapper();

describe("DeterministicFactElementMapper", () => {
  it("preserves explicit fact → element mapping", () => {
    const result = mapper.map({
      facts: [
        fact("f1", "Defendant transferred the vehicle to X.", {
          elementId: "el:transfer",
        }),
      ],
      elements: [transfer],
      evidence: [{ id: "e1", factId: "f1", description: "title deed", sourceId: "ex" }],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      factId: "f1",
      elementId: "el:transfer",
      relation: FactElementRelation.SUPPORTS,
      method: MappingMethod.EXPLICIT,
      confidence: MappingConfidence.HIGH,
    });
    expect(result.mappings[0]?.evidenceIds).toEqual(["e1"]);
    expect(result.mappings[0]?.explanation).toMatch(/EXPLICIT/);
  });

  it("preserves explicit NEGATES mapping", () => {
    const result = mapper.map({
      facts: [
        fact("f1", "Vehicle remained with defendant.", {
          elementId: "el:transfer",
          mappingRelation: FactElementRelation.NEGATES,
        }),
      ],
      elements: [transfer],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings[0]?.relation).toBe(FactElementRelation.NEGATES);
    expect(result.mappings[0]?.method).toBe(MappingMethod.EXPLICIT);
  });

  it("preserves MANUAL mapping without reinterpretation", () => {
    const result = mapper.map({
      facts: [fact("f1", "Custom narrative that does not overlap.", { elementId: null })],
      elements: [transfer],
      evidence: [],
      applicableAt: "2024-06-01",
      explicitMappings: [
        {
          factId: "f1",
          elementId: "el:transfer",
          method: MappingMethod.MANUAL,
          relation: FactElementRelation.SUPPORTS,
          explanation: "Lawyer assigned this fact.",
        },
      ],
    });
    expect(result.mappings[0]?.method).toBe(MappingMethod.MANUAL);
    expect(result.mappings[0]?.explanation).toBe("Lawyer assigned this fact.");
    expect(result.mappings[0]?.factText).toBe("Custom narrative that does not overlap.");
  });

  it("maps lexical SUPPORTS with HIGH confidence for a shared phrase", () => {
    const result = mapper.map({
      facts: [fact("f1", "The property was transferred to X on Monday.")],
      elements: [transfer],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings[0]?.method).toBe(MappingMethod.LEXICAL);
    expect(result.mappings[0]?.relation).toBe(FactElementRelation.SUPPORTS);
    expect(result.mappings[0]?.confidence).toBe(MappingConfidence.HIGH);
  });

  it("maps lexical NEGATES when overlap is present with a negation marker", () => {
    const result = mapper.map({
      facts: [fact("f1", "The property was not transferred to anyone.")],
      elements: [transfer],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings[0]?.relation).toBe(FactElementRelation.NEGATES);
    expect(result.mappings[0]?.method).toBe(MappingMethod.LEXICAL);
    expect(result.mappings[0]?.explanation).toMatch(/negation/i);
  });

  it("rejects weak lexical overlap as unmapped", () => {
    const result = mapper.map({
      facts: [fact("f1", "The sky was blue that morning.")],
      elements: [transfer],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings).toEqual([]);
    expect(result.unmappedFactIds).toEqual(["f1"]);
  });

  it("does not let LOW-confidence lexical mappings satisfy a required element", () => {
    const result = mapper.map({
      facts: [fact("f1", "They discussed property yesterday.")],
      elements: [transfer],
      evidence: [{ id: "e1", factId: "f1", description: "note", sourceId: "x" }],
      applicableAt: "2024-06-01",
    });
    const mapping = result.mappings[0];
    expect(mapping?.confidence).toBe(MappingConfidence.LOW);
    expect(mappingIsAdequate(mapping!)).toBe(false);
    const evaluation = evaluateElementMappings(transfer, result.mappings, [
      fact("f1", "They discussed property yesterday."),
    ]);
    expect(evaluation.status).toBe(SubsumptionMatchStatus.NOT_EVALUATED);
  });

  it("marks conflicting SUPPORTS and NEGATES as UNCERTAIN", () => {
    const mappings = mapper.map({
      facts: [
        fact("a", "The property was transferred to X.", { elementId: "el:transfer" }),
        fact("b", "Vehicle remained with defendant.", {
          elementId: "el:transfer",
          mappingRelation: FactElementRelation.NEGATES,
        }),
      ],
      elements: [transfer],
      evidence: [
        { id: "ea", factId: "a", description: "deed", sourceId: "x" },
        { id: "eb", factId: "b", description: "possession", sourceId: "y" },
      ],
      applicableAt: "2024-06-01",
    }).mappings;
    const evaluation = evaluateElementMappings(transfer, mappings, [
      fact("a", "The property was transferred to X."),
      fact("b", "Vehicle remained with defendant."),
    ]);
    expect(evaluation.status).toBe(SubsumptionMatchStatus.UNCERTAIN);
    expect(evaluation.supportingFactIds).toContain("a");
    expect(evaluation.negatingFactIds).toContain("b");
  });

  it("returns NOT_EVALUATED when there is no mapping", () => {
    const evaluation = evaluateElementMappings(transfer, [], []);
    expect(evaluation.status).toBe(SubsumptionMatchStatus.NOT_EVALUATED);
  });

  it("keeps evidence ids on the mapping without treating evidence as proof", () => {
    const result = mapper.map({
      facts: [
        fact("f1", "The property was transferred to X.", { elementId: "el:transfer" }),
      ],
      elements: [transfer],
      evidence: [
        { id: "e1", factId: "f1", description: "exhibit", sourceId: "archive:1" },
      ],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings[0]?.evidenceIds).toEqual(["e1"]);
  });

  it("allows multiple facts to support one element", () => {
    const result = mapper.map({
      facts: [
        fact("f1", "The property was transferred to X.", { elementId: "el:transfer" }),
        fact("f2", "A bill of sale shows the property was transferred.", {
          elementId: "el:transfer",
        }),
      ],
      elements: [transfer],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings.every((m) => m.elementId === "el:transfer")).toBe(true);
  });

  it("allows one fact to support multiple elements", () => {
    const causation = element("el:cause", "causation of the prohibited result", 2);
    const result = mapper.map({
      facts: [
        fact("f1", "The actor transferred property causing the prohibited result.", {
          elementIds: ["el:transfer", "el:cause"],
        }),
      ],
      elements: [transfer, causation],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings.map((m) => m.elementId).sort()).toEqual([
      "el:cause",
      "el:transfer",
    ]);
  });

  it("rejects mappings when the element is outside applicableAt", () => {
    const historical = element("el:old", "property was transferred", 1, emptyTemporal({
      validFrom: "2010-01-01",
      validTo: "2012-12-31",
    }));
    const result = mapper.map({
      facts: [
        fact("f1", "The property was transferred to X.", { elementId: "el:old" }),
      ],
      elements: [historical],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(result.mappings).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/inapplicable|applicableAt/i);
  });

  it("has no LLM dependency", () => {
    const result = mapper.map({
      facts: [fact("f1", "The property was transferred to X.")],
      elements: [transfer],
      evidence: [],
      applicableAt: "2024-06-01",
    });
    expect(JSON.stringify(result.mappings)).not.toMatch(/AI_INFERENCE|openai|llm/i);
  });
});

describe("case analysis mapping integration", () => {
  const issue: LegalIssue = {
    id: "issue:map",
    statement: "Whether the transfer element is satisfied",
    domain: LegalDomain.CIVIL,
    classification: {
      domain: LegalDomain.CIVIL,
      topics: ["civil"],
      nature: "SUBSTANTIVE",
      confidence: 0.7,
    },
    temporal: emptyTemporal({ applicableAt: "2024-06-01" }),
    provenance: [],
    unresolved: false,
  };

  const rule: LegalRule = {
    id: "rule:map",
    statement: "Fixture transfer rule.",
    doctrineId: null,
    positiveLawRef: "law:1",
    temporal: emptyTemporal({ validFrom: "2020-01-01" }),
    provenance: [
      {
        sourceId: "law:1",
        sourceKind: LegalAuthorityKind.POSITIVE_LAW,
        citation: "art. 1",
        locator: "art.1",
      },
    ],
  };

  const legalTest: LegalTest = {
    id: "test:map",
    name: "Transfer test",
    doctrineId: null,
    ruleId: rule.id,
    elements: [transfer],
    temporal: emptyTemporal({ validFrom: "2020-01-01" }),
    provenance: rule.provenance,
  };

  const retrieved: RetrievedLegalRule = {
    rule,
    sourceId: "legalinfo",
    sourceUrl: "https://legalinfo.mn/x",
    officialUrl: "https://legalinfo.mn/x",
    legalDocumentId: "doc:1",
    articleId: "art:1",
    articleNumber: "1",
    articleOrChunkId: "art:1",
    chunkId: "chunk:1",
    title: "Transfer",
    articleText: "property was transferred",
    temporal: rule.temporal,
    supportStatus: ReasoningSupportStatus.SOURCE_BACKED,
    confidence: 1,
  };

  function orchestrator() {
    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved);
    const classifier = new RuleBasedLegalDomainClassifier();
    return createCaseAnalysisOrchestrator({
      issueSpotter: new RuleBasedIssueSpotter(classifier),
      ruleRetriever: retriever,
      classifier,
      criminalFramework: new EmptyCriminalDoctrineFramework(),
      civilFramework: new EmptyCivilDoctrineFramework(),
      administrativeFramework: new EmptyAdministrativeDoctrineFramework(),
    });
  }

  it("supports a conclusion only when the required element is adequately mapped", async () => {
    const result = await orchestrator().analyze({
      facts: [
        fact("f1", "The property was transferred to X.", { elementId: "el:transfer" }),
      ],
      evidence: [{ id: "e1", factId: "f1", description: "deed", sourceId: "x" }],
      applicableAt: "2024-06-01",
      issue,
      legalTest,
    });
    expect(result.mappings[0]?.method).toBe(MappingMethod.EXPLICIT);
    expect(result.subsumption.applications[0]?.result).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
    expect(result.conclusion.disposition).toBe(ConclusionDisposition.SUPPORTED);
    expect(result.review.mappings).toHaveLength(1);
    expect(result.review.elements[0]?.status).toBe(SubsumptionMatchStatus.SATISFIED);
    expect(() => JSON.stringify(result.review)).not.toThrow();
    expect(() => JSON.stringify(result.trace)).not.toThrow();
  });

  it("returns INSUFFICIENT_FACTS when required elements are unresolved", async () => {
    const result = await orchestrator().analyze({
      facts: [fact("f1", "The sky was blue that morning.")],
      evidence: [],
      applicableAt: "2024-06-01",
      issue,
      legalTest,
    });
    expect(result.subsumption.applications[0]?.result).toBe(
      SubsumptionMatchStatus.NOT_EVALUATED,
    );
    expect(result.conclusion.disposition).toBe(
      ConclusionDisposition.INSUFFICIENT_FACTS,
    );
  });

  it("builds a review structure without a UI", async () => {
    const analyzed = await orchestrator().analyze({
      facts: [
        fact("f1", "The property was transferred to X.", { elementId: "el:transfer" }),
      ],
      evidence: [{ id: "e1", factId: "f1", description: "deed", sourceId: "x" }],
      applicableAt: "2024-06-01",
      issue,
      legalTest,
    });
    const review = buildCaseAnalysisReview(analyzed, {
      facts: analyzed.review.facts.map((f) => ({
        id: f.id,
        statement: f.statement,
        elementId: null,
        disputed: f.disputed,
      })),
      evidence: analyzed.review.evidence,
    });
    expect(review.issues[0]?.id).toBe("issue:map");
    expect(review.tests[0]?.id).toBe("test:map");
    expect(review.conclusions).toHaveLength(1);
  });
});
