import { describe, expect, it } from "vitest";

import {
  ADMINISTRATIVE_ISSUE_KINDS,
  CIVIL_ISSUE_KINDS,
  CRIMINAL_ISSUE_KINDS,
  CaseAnalysisStage,
  ConclusionDisposition,
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  InMemoryRuleRetriever,
  LegalAuthorityKind,
  LegalDomain,
  LegalIssueKind,
  NullLegalReasoningModel,
  ReasoningSupportStatus,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  SubsumptionMatchStatus,
  createCaseAnalysisOrchestrator,
  createDoctrineConflict,
  createDoctrineEngine,
  emptyTemporal,
  isApplicableAt,
  issueKindsForDomain,
  type LegalDoctrine,
  type LegalElement,
  type LegalEvidence,
  type LegalFact,
  type LegalIssue,
  type LegalRule,
  type LegalTest,
  type RetrievedLegalRule,
} from "@/engine/doctrine";

function positiveLawProvenance(sourceId: string) {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.POSITIVE_LAW,
    citation: `Fixture statute ${sourceId}`,
    locator: "art. 1",
  };
}

function scholarlyProvenance(sourceId: string) {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.DOCTRINE,
    citation: `Fixture treatise ${sourceId}`,
    locator: "§1",
  };
}

function aiProvenance() {
  return {
    sourceId: "llm:only",
    sourceKind: LegalAuthorityKind.AI_INFERENCE,
    citation: null,
    locator: null,
  };
}

function element(id: string, order: number): LegalElement {
  return {
    id,
    label: `Element ${id}`,
    description: `Fixture element ${id}`,
    required: true,
    order,
    conceptId: null,
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: null,
      sourceVersion: "v1",
    }),
    provenance: [scholarlyProvenance("fixture:treatise-1")],
  };
}

function fixtureIssue(domain: typeof LegalDomain.CRIMINAL = LegalDomain.CRIMINAL): LegalIssue {
  return {
    id: "issue:case-1",
    statement: "Whether the criminal offense elements are satisfied",
    domain,
    classification: {
      domain,
      topics: ["criminal"],
      nature: "SUBSTANTIVE",
      confidence: 0.7,
    },
    temporal: emptyTemporal({ applicableAt: "2024-06-01" }),
    provenance: [scholarlyProvenance("fixture:issue-source")],
    unresolved: false,
  };
}

function fixtureDoctrine(domain = LegalDomain.CRIMINAL): LegalDoctrine {
  return {
    id: "doctrine:case-1",
    name: "Fixture doctrine",
    statement: "Fixture doctrine statement for unit tests only.",
    domain,
    relatedPositiveLawIds: ["law:fixture"],
    relatedCourtDecisionIds: [],
    concepts: [],
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: null,
      sourceVersion: "fixture-v1",
      applicableAt: "2024-06-01",
    }),
    provenance: [scholarlyProvenance("fixture:treatise-1")],
  };
}

function fixtureRule(overrides: Partial<LegalRule> = {}): LegalRule {
  return {
    id: "rule:case-1",
    statement: "Fixture positive-law rule for unit tests only.",
    doctrineId: "doctrine:case-1",
    positiveLawRef: "law:fixture",
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: "2025-12-31",
      sourceVersion: "fixture-v1",
    }),
    provenance: [positiveLawProvenance("law:fixture")],
    ...overrides,
  };
}

function fixtureTest(elements: LegalElement[]): LegalTest {
  return {
    id: "test:case-1",
    name: "Fixture test",
    doctrineId: "doctrine:case-1",
    ruleId: "rule:case-1",
    elements,
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: null,
      sourceVersion: "fixture-v1",
    }),
    provenance: [scholarlyProvenance("fixture:treatise-1")],
  };
}

function retrieved(
  rule: LegalRule,
  overrides: Partial<RetrievedLegalRule> = {},
): RetrievedLegalRule {
  return {
    rule,
    sourceId: rule.provenance[0]?.sourceId ?? "unknown",
    sourceUrl: "https://example.test/law/fixture",
    officialUrl: "https://example.test/law/fixture",
    legalDocumentId: "doc:fixture",
    articleId: "art:1",
    articleNumber: "1",
    articleOrChunkId: "art:1",
    chunkId: "chunk:1",
    title: "Fixture article",
    temporal: rule.temporal,
    supportStatus: ReasoningSupportStatus.SOURCE_BACKED,
    confidence: 0.9,
    ...overrides,
  };
}

function makeOrchestrator(retriever: InMemoryRuleRetriever) {
  const classifier = new RuleBasedLegalDomainClassifier();
  return createCaseAnalysisOrchestrator({
    issueSpotter: new RuleBasedIssueSpotter(classifier),
    ruleRetriever: retriever,
    classifier,
    criminalFramework: new EmptyCriminalDoctrineFramework(),
    civilFramework: new EmptyCivilDoctrineFramework(),
    administrativeFramework: new EmptyAdministrativeDoctrineFramework(),
    assistiveModel: new NullLegalReasoningModel(),
  });
}

describe("case analysis orchestration", () => {
  it("returns SUPPORTED conclusion with provenance, facts, evidence, and full trace", async () => {
    const el1 = element("el:1", 1);
    const el2 = element("el:2", 2);
    const facts: LegalFact[] = [
      {
        id: "fact:1",
        statement: "Actor performed the charged offense conduct.",
        elementId: el1.id,
        disputed: false,
      },
      {
        id: "fact:2",
        statement: "Actor acted with the required mental element.",
        elementId: el2.id,
        disputed: false,
      },
    ];
    const evidence: LegalEvidence[] = [
      {
        id: "ev:1",
        factId: "fact:1",
        description: "Witness statement",
        sourceId: "exhibit:1",
      },
      {
        id: "ev:2",
        factId: "fact:2",
        description: "Documentary proof",
        sourceId: "exhibit:2",
      },
    ];

    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved(fixtureRule()));
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts,
      evidence,
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el1, el2]),
    });

    expect(result.conclusion.disposition).toBe(ConclusionDisposition.SUPPORTED);
    expect(result.conclusion.accepted).toBe(true);
    expect(result.conclusion.sourceDocumentIds.length).toBeGreaterThan(0);
    expect(result.conclusion.articleOrChunkIds).toEqual(["art:1"]);
    expect(result.conclusion.reliedFactIds).toEqual(["fact:1", "fact:2"]);
    expect(result.conclusion.reliedEvidenceIds).toEqual(["ev:1", "ev:2"]);
    expect(result.subsumption.allRequiredSatisfied).toBe(true);
    expect(result.trace.stages.map((s) => s.stage)).toEqual([
      CaseAnalysisStage.FACTS,
      CaseAnalysisStage.LEGAL_ISSUES,
      CaseAnalysisStage.APPLICABLE_DOMAIN,
      CaseAnalysisStage.APPLICABLE_DOCTRINE,
      CaseAnalysisStage.LEGAL_RULES,
      CaseAnalysisStage.ELEMENTS_TEST,
      CaseAnalysisStage.EVIDENCE,
      CaseAnalysisStage.FACT_MAPPING,
      CaseAnalysisStage.SUBSUMPTION,
      CaseAnalysisStage.COUNTERARGUMENTS,
      CaseAnalysisStage.CONCLUSION,
    ]);
    // Serializable JSON for UI
    expect(() => JSON.stringify(result.trace)).not.toThrow();
  });

  it("rejects unsupported rules without authoritative provenance", async () => {
    const retriever = new InMemoryRuleRetriever();
    retriever.register(
      retrieved(
        fixtureRule({
          id: "rule:ai-only",
          provenance: [aiProvenance()],
        }),
        {
          supportStatus: ReasoningSupportStatus.UNSUPPORTED,
          sourceId: "llm:only",
        },
      ),
    );
    const orchestrator = makeOrchestrator(retriever);
    const el = element("el:x", 1);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "Some criminal offense fact",
          elementId: el.id,
          disputed: false,
        },
      ],
      evidence: [
        {
          id: "e1",
          factId: "f1",
          description: "exhibit",
          sourceId: "ex",
        },
      ],
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el]),
    });

    expect(result.retrievedRules).toHaveLength(0);
    expect(result.conclusion.disposition).toBe(ConclusionDisposition.UNSUPPORTED);
    expect(result.conclusion.accepted).toBe(false);
  });

  it("returns INSUFFICIENT_FACTS when required elements lack mapped facts", async () => {
    const el1 = element("el:a", 1);
    const el2 = element("el:b", 2);
    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved(fixtureRule()));
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts: [],
      evidence: [],
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el1, el2]),
    });

    expect(result.conclusion.disposition).toBe(
      ConclusionDisposition.INSUFFICIENT_FACTS,
    );
    expect(result.subsumption.hasInsufficientFacts).toBe(true);
  });

  it("marks uncertain elements when facts are disputed or lack evidence", async () => {
    const el = element("el:unc", 1);
    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved(fixtureRule()));
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f-disputed",
          statement: "Disputed criminal conduct",
          elementId: el.id,
          disputed: true,
        },
      ],
      evidence: [
        {
          id: "e-counter",
          factId: "f-disputed",
          description: "Counter-evidence",
          sourceId: "ex-c",
        },
      ],
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el]),
    });

    expect(result.subsumption.applications[0]?.result).toBe(
      SubsumptionMatchStatus.UNCERTAIN,
    );
    expect(result.conclusion.disposition).toBe(
      ConclusionDisposition.INSUFFICIENT_FACTS,
    );
  });

  it("returns CONFLICTING_AUTHORITY for unresolved conflicting rules", async () => {
    const el = element("el:c", 1);
    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved(fixtureRule({ id: "rule:a", statement: "Rule A" })));
    retriever.register(
      retrieved(
        fixtureRule({
          id: "rule:b",
          statement: "Rule B differs",
          provenance: [positiveLawProvenance("law:fixture-b")],
        }),
      ),
    );
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "offense fact",
          elementId: el.id,
          disputed: false,
        },
      ],
      evidence: [
        { id: "e1", factId: "f1", description: "ev", sourceId: "x" },
      ],
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el]),
      conflicts: [
        createDoctrineConflict({
          id: "conflict:fixture",
          description: "Unresolved doctrine conflict fixture",
          subjectIds: ["doctrine:case-1"],
        }),
      ],
    });

    expect(result.conflicts.some((c) => c.unresolved)).toBe(true);
    expect(result.conclusion.disposition).toBe(
      ConclusionDisposition.CONFLICTING_AUTHORITY,
    );
    expect(result.conclusion.accepted).toBe(false);
  });

  it("respects historical applicableAt and does not use later law", async () => {
    const el = element("el:t", 1);
    const historical = fixtureRule({
      id: "rule:old",
      temporal: emptyTemporal({
        validFrom: "2010-01-01",
        validTo: "2015-12-31",
        sourceVersion: "old",
      }),
    });
    const current = fixtureRule({
      id: "rule:new",
      temporal: emptyTemporal({
        validFrom: "2016-01-01",
        validTo: null,
        sourceVersion: "new",
      }),
    });

    expect(isApplicableAt(historical.temporal, "2012-06-01")).toBe(true);
    expect(isApplicableAt(historical.temporal, "2024-06-01")).toBe(false);
    expect(isApplicableAt(current.temporal, "2012-06-01")).toBe(false);

    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved(historical));
    retriever.register(retrieved(current));
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "criminal offense in 2012",
          elementId: el.id,
          disputed: false,
        },
      ],
      evidence: [
        { id: "e1", factId: "f1", description: "ev", sourceId: "x" },
      ],
      applicableAt: "2012-06-01",
      issue: fixtureIssue(),
      doctrine: {
        ...fixtureDoctrine(),
        temporal: emptyTemporal({
          validFrom: "2010-01-01",
          validTo: null,
          sourceVersion: "old",
        }),
      },
      legalTest: {
        ...fixtureTest([el]),
        temporal: emptyTemporal({
          validFrom: "2010-01-01",
          validTo: null,
          sourceVersion: "old",
        }),
      },
    });

    expect(result.retrievedRules.map((r) => r.rule.id)).toEqual(["rule:old"]);
    expect(result.selectedRule?.id).toBe("rule:old");
    expect(result.trace.temporal.applicableAt).toBe("2012-06-01");
  });

  it("links evidence into element applications", async () => {
    const el = element("el:ev", 1);
    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved(fixtureRule()));
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "offense conduct",
          elementId: el.id,
          disputed: false,
        },
      ],
      evidence: [
        {
          id: "e1",
          factId: "f1",
          description: "Linked exhibit",
          sourceId: "archive:1",
        },
      ],
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el]),
    });

    expect(result.subsumption.applications[0]?.supportingEvidenceIds).toEqual([
      "e1",
    ]);
    expect(result.subsumption.applications[0]?.result).toBe(
      SubsumptionMatchStatus.SATISFIED,
    );
  });

  it("preserves citation provenance on supported conclusions", async () => {
    const el = element("el:cite", 1);
    const retriever = new InMemoryRuleRetriever();
    retriever.register(
      retrieved(fixtureRule(), {
        legalDocumentId: "doc:citation",
        articleOrChunkId: "chunk:42",
        sourceUrl: "https://legalinfo.example/mn/law/1",
      }),
    );
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "offense",
          elementId: el.id,
          disputed: false,
        },
      ],
      evidence: [
        { id: "e1", factId: "f1", description: "ev", sourceId: "x" },
      ],
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el]),
    });

    expect(result.conclusion.disposition).toBe(ConclusionDisposition.SUPPORTED);
    expect(result.conclusion.sourceDocumentIds).toContain("doc:citation");
    expect(result.conclusion.articleOrChunkIds).toEqual(["chunk:42"]);
    expect(result.selectedRule?.provenance[0]?.citation).toContain("Fixture statute");
  });

  it("exposes criminal / civil / administrative issue frameworks without inventing doctrine", () => {
    expect(CRIMINAL_ISSUE_KINDS).toContain(LegalIssueKind.ELEMENTS_OF_OFFENSE);
    expect(CIVIL_ISSUE_KINDS).toContain(LegalIssueKind.BREACH);
    expect(ADMINISTRATIVE_ISSUE_KINDS).toContain(
      LegalIssueKind.ADMINISTRATIVE_LEGALITY,
    );
    expect(issueKindsForDomain(LegalDomain.CRIMINAL)).toEqual(
      CRIMINAL_ISSUE_KINDS,
    );
    expect(new EmptyCriminalDoctrineFramework().identifyIssues().issues).toEqual(
      [],
    );
    expect(new EmptyCivilDoctrineFramework().selectApplicableDoctrine().rules).toEqual(
      [],
    );
    expect(
      new EmptyAdministrativeDoctrineFramework().proposeConclusionStructure(),
    ).toBeNull();
  });

  it("spots candidate criminal issues only when facts support them", () => {
    const spotter = new RuleBasedIssueSpotter(
      new RuleBasedLegalDomainClassifier(),
    );
    const withSupport = spotter.spot([
      {
        id: "f1",
        statement: "The charged criminal offense involved intentional conduct",
        elementId: null,
        disputed: false,
      },
    ]);
    expect(withSupport.domain).toBe(LegalDomain.CRIMINAL);
    expect(withSupport.candidates.some((c) => c.supportedByFacts)).toBe(true);

    const without = spotter.spot([
      {
        id: "f2",
        statement: "The sky was blue that morning",
        elementId: null,
        disputed: false,
      },
    ]);
    expect(without.candidates).toHaveLength(0);
  });

  it("rejects LLM-only conclusions", async () => {
    const el = element("el:llm", 1);
    const retriever = new InMemoryRuleRetriever();
    retriever.register(retrieved(fixtureRule()));
    const orchestrator = makeOrchestrator(retriever);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "offense",
          elementId: el.id,
          disputed: false,
        },
      ],
      evidence: [
        { id: "e1", factId: "f1", description: "ev", sourceId: "x" },
      ],
      applicableAt: "2024-06-01",
      issue: fixtureIssue(),
      doctrine: fixtureDoctrine(),
      legalTest: fixtureTest([el]),
      llmOnlyConclusion: true,
      proposedConclusionStatement: "The defendant is guilty because the model says so",
    });

    expect(result.conclusion.disposition).toBe(ConclusionDisposition.UNSUPPORTED);
    expect(result.conclusion.accepted).toBe(false);
    expect(result.conclusion.statement).toMatch(/LLM-only/i);
  });

  it("wires analyzeCase through createDoctrineEngine", async () => {
    const engine = createDoctrineEngine();
    const result = await engine.analyzeCase({
      facts: [
        {
          id: "f1",
          statement: "civil contract obligation and breach of duty",
          elementId: null,
          disputed: false,
        },
      ],
      evidence: [],
      applicableAt: "2024-01-01",
    });
    expect(result.domain).toBe(LegalDomain.CIVIL);
    expect(result.conclusion.disposition).not.toBe(
      ConclusionDisposition.SUPPORTED,
    );
  });
});
