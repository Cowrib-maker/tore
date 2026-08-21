import { describe, expect, it } from "vitest";

import {
  ConclusionDisposition,
  ElementExtractionKind,
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  InMemoryRuleRetriever,
  LegalAuthorityKind,
  LegalDomain,
  ReasoningSupportStatus,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  SourceGroundedLegalTestExtractor,
  bindFactsToElements,
  createCaseAnalysisOrchestrator,
  emptyTemporal,
  type LegalFact,
  type LegalIssue,
  type LegalRule,
  type RetrievedLegalRule,
} from "@/engine/doctrine";

function positiveLawProvenance(sourceId = "legalinfo") {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.POSITIVE_LAW,
    citation: "Criminal Code — art. 15",
    locator: "art.15",
  };
}

function retrievedRule(
  overrides: Partial<RetrievedLegalRule> & { articleText: string },
): RetrievedLegalRule {
  const { rule: ruleOverrides, articleText, ...rest } = overrides;
  const rule: LegalRule = {
    id: "rule:knowledge:doc:article:extract-15",
    statement: `Criminal Code fixture — Article 15\n${articleText}`,
    doctrineId: null,
    positiveLawRef: "doc",
    temporal: emptyTemporal({
      validFrom: "2015-01-01",
      validTo: "2025-12-31",
      sourceVersion: "v2",
      applicableAt: "2024-06-01",
    }),
    provenance: [positiveLawProvenance()],
    ...ruleOverrides,
  };
  return {
    rule,
    sourceId: "legalinfo",
    sourceUrl: "https://legalinfo.mn/mn/detail?lawId=criminal",
    officialUrl: "https://legalinfo.mn/mn/detail?lawId=criminal",
    legalDocumentId: "doc:criminal",
    articleId: "article:extract-15",
    articleNumber: "15",
    articleOrChunkId: "article:extract-15",
    chunkId: "chunk:extract-15",
    title: "Elements of offense",
    articleText,
    temporal: rule.temporal,
    supportStatus: ReasoningSupportStatus.SOURCE_BACKED,
    confidence: 1,
    matchKind: "ARTICLE_NUMBER",
    ...rest,
  };
}

const extractor = new SourceGroundedLegalTestExtractor();

describe("SourceGroundedLegalTestExtractor", () => {
  it("extracts enumerated English clauses with article provenance", () => {
    const rule = retrievedRule({
      articleText:
        "1. Intentional criminal conduct is required. 2. Causation of the prohibited result is required.",
    });

    const test = extractor.extract(rule, {
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-06-01",
    });

    expect(test.extractionStatus).toBe(ReasoningSupportStatus.SOURCE_BACKED);
    expect(test.extractionKind).toBe(ElementExtractionKind.ENUMERATED);
    expect(test.doctrineId).toBeNull();
    expect(test.domain).toBe(LegalDomain.CRIMINAL);
    expect(test.ruleId).toBe(rule.rule.id);
    expect(test.sourceId).toBe("legalinfo");
    expect(test.sourceUrl).toContain("legalinfo.mn");
    expect(test.legalDocumentId).toBe("doc:criminal");
    expect(test.articleId).toBe("article:extract-15");
    expect(test.articleNumber).toBe("15");
    expect(test.elements).toHaveLength(2);
    expect(test.elements[0]?.id).toBe("el:article:extract-15:1");
    expect(test.elements[0]?.description).toMatch(/Intentional criminal conduct/);
    expect(test.elements[1]?.description).toMatch(/Causation of the prohibited result/);
    expect(test.elements.every((el) => el.required)).toBe(true);
    expect(test.elements[0]?.provenance[0]?.sourceKind).toBe(
      LegalAuthorityKind.POSITIVE_LAW,
    );
    expect(test.elements[0]?.provenance[0]?.locator).toContain("art.15");
    expect(test.temporal.validFrom).toBe("2015-01-01");
    expect(test.temporal.applicableAt).toBe("2024-06-01");
    expect(JSON.stringify(test)).toBeTruthy();
  });

  it("extracts Mongolian numbered clauses without inventing doctrine labels", () => {
    const rule = retrievedRule({
      articleText:
        "1. Гэрээ байгуулагдсан байх. 2. Үүргээ биелүүлээгүй байх.",
    });
    const test = extractor.extract(rule, {
      domain: LegalDomain.CIVIL,
      applicableAt: "2024-01-01",
    });

    expect(test.extractionKind).toBe(ElementExtractionKind.ENUMERATED);
    expect(test.elements).toHaveLength(2);
    expect(test.elements[0]?.description).toContain("Гэрээ байгуулагдсан");
    expect(test.elements[1]?.description).toContain("Үүргээ биелүүлээгүй");
    const blob = JSON.stringify(test.elements);
    expect(blob).not.toMatch(/actus reus/i);
    expect(blob).not.toMatch(/mens rea/i);
  });

  it("extracts lettered (a)(b) clauses", () => {
    const rule = retrievedRule({
      articleText:
        "Liability arises when (a) the agency acted outside its competence and (b) the person suffered a legal harm.",
    });
    const test = extractor.extract(rule, {
      domain: LegalDomain.ADMINISTRATIVE,
      applicableAt: "2024-01-01",
    });
    expect(test.extractionKind).toBe(ElementExtractionKind.ENUMERATED);
    expect(test.elements).toHaveLength(2);
    expect(test.elements[0]?.description).toMatch(/outside its competence/);
    expect(test.elements[1]?.description).toMatch(/legal harm/);
  });

  it("extracts semicolon lists after a colon", () => {
    const rule = retrievedRule({
      articleText:
        "A party is liable when: the contract was formed; the obligation was breached; damage resulted.",
    });
    const test = extractor.extract(rule, {
      domain: LegalDomain.CIVIL,
      applicableAt: "2024-01-01",
    });
    expect(test.extractionKind).toBe(ElementExtractionKind.CONJUNCTIVE_LIST);
    expect(test.elements).toHaveLength(3);
    expect(test.elements.map((e) => e.description).join("|")).toMatch(/contract was formed/);
  });

  it("uses the whole article as a single source-backed element when unstructured", () => {
    const rule = retrievedRule({
      articleText:
        "A party that breaches a civil obligation is liable for damages.",
    });
    const test = extractor.extract(rule, {
      domain: LegalDomain.CIVIL,
      applicableAt: "2024-01-01",
    });
    expect(test.extractionKind).toBe(ElementExtractionKind.WHOLE_ARTICLE);
    expect(test.elements).toHaveLength(1);
    expect(test.elements[0]?.description).toContain("breaches a civil obligation");
    expect(test.extractionStatus).toBe(ReasoningSupportStatus.SOURCE_BACKED);
  });

  it("returns INCOMPLETE rather than inventing elements for empty text", () => {
    const rule = retrievedRule({ articleText: "   " });
    rule.articleText = "   ";
    rule.rule.statement = "Title only";
    const test = extractor.extract(rule, { applicableAt: "2024-01-01" });
    expect(test.elements).toHaveLength(0);
    expect(test.extractionKind).toBe(ElementExtractionKind.NONE);
    expect(test.extractionStatus).toBe(ReasoningSupportStatus.INCOMPLETE);
  });

  it("does not extract an authoritative test from PARTIAL or AI-only rules", () => {
    const partial = retrievedRule({
      articleText: "1. First required clause here. 2. Second required clause here.",
      supportStatus: ReasoningSupportStatus.PARTIAL,
    });
    expect(
      extractor.extract(partial, { applicableAt: "2024-01-01" }).extractionStatus,
    ).toBe(ReasoningSupportStatus.UNSUPPORTED);

    const aiOnly = retrievedRule({
      articleText: "1. First required clause here. 2. Second required clause here.",
    });
    aiOnly.rule.provenance = [
      {
        sourceId: "llm",
        sourceKind: LegalAuthorityKind.AI_INFERENCE,
        citation: null,
        locator: null,
      },
    ];
    expect(
      extractor.extract(aiOnly, { applicableAt: "2024-01-01" }).extractionStatus,
    ).toBe(ReasoningSupportStatus.UNSUPPORTED);
    expect(
      extractor.extract(aiOnly, { applicableAt: "2024-01-01" }).elements,
    ).toEqual([]);
  });

  it("does not extract from a historically inapplicable rule", () => {
    const rule = retrievedRule({
      articleText: "1. First required clause here. 2. Second required clause here.",
    });
    const test = extractor.extract(rule, { applicableAt: "2010-01-01" });
    expect(test.extractionStatus).toBe(ReasoningSupportStatus.UNSUPPORTED);
    expect(test.elements).toEqual([]);
  });

  it("does not invent actus reus / mens rea labels", () => {
    const rule = retrievedRule({
      articleText: "Theft of property is punishable by a fine or imprisonment.",
    });
    const test = extractor.extract(rule, {
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-01-01",
    });
    const blob = `${test.name} ${test.elements.map((e) => e.label).join(" ")}`;
    expect(blob).not.toMatch(/actus reus/i);
    expect(blob).not.toMatch(/mens rea/i);
    expect(blob).not.toMatch(/corpus delicti/i);
  });

  it("has no LLM dependency", () => {
    const rule = retrievedRule({
      articleText: "1. First required clause here. 2. Second required clause here.",
    });
    const test = extractor.extract(rule, { applicableAt: "2024-06-01" });
    expect(
      test.provenance.every((p) => p.sourceKind !== LegalAuthorityKind.AI_INFERENCE),
    ).toBe(true);
  });
});

describe("bindFactsToElements", () => {
  it("maps unmapped facts by lexical overlap with clause text", () => {
    const rule = retrievedRule({
      articleText:
        "1. Intentional criminal conduct is required. 2. Causation of the prohibited result is required.",
    });
    const test = extractor.extract(rule, { applicableAt: "2024-06-01" });
    const facts: LegalFact[] = [
      {
        id: "f1",
        statement: "The actor engaged in intentional criminal conduct that night.",
        elementId: null,
        disputed: false,
      },
    ];
    const bound = bindFactsToElements(facts, test.elements);
    expect(bound[0]?.elementId).toBe("el:article:extract-15:1");
  });
});

describe("case analysis uses extracted tests", () => {
  const issue: LegalIssue = {
    id: "issue:extract",
    statement: "Whether Article 15 offense elements are satisfied",
    domain: LegalDomain.CRIMINAL,
    classification: {
      domain: LegalDomain.CRIMINAL,
      topics: ["criminal"],
      nature: "SUBSTANTIVE",
      confidence: 0.7,
    },
    temporal: emptyTemporal({ applicableAt: "2024-06-01" }),
    provenance: [],
    unresolved: false,
  };

  function orchestratorWith(rule: RetrievedLegalRule) {
    const retriever = new InMemoryRuleRetriever();
    retriever.register(rule);
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

  it("wires extracted elements into subsumption without a doctrine corpus", async () => {
    const rule = retrievedRule({
      articleText:
        "1. Intentional criminal conduct is required. 2. Causation of the prohibited result is required.",
    });
    const orchestrator = orchestratorWith(rule);

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "Actor performed intentional criminal conduct.",
          elementId: "el:article:extract-15:1",
          disputed: false,
        },
        {
          id: "f2",
          statement: "The conduct caused the prohibited result.",
          elementId: "el:article:extract-15:2",
          disputed: false,
        },
      ],
      evidence: [
        { id: "e1", factId: "f1", description: "witness", sourceId: "ex1" },
        { id: "e2", factId: "f2", description: "report", sourceId: "ex2" },
      ],
      applicableAt: "2024-06-01",
      issue,
      retrievalQuery: "Article 15",
    });

    expect(result.extractedTest?.extractionKind).toBe(
      ElementExtractionKind.ENUMERATED,
    );
    expect(result.legalTest?.elements).toHaveLength(2);
    expect(result.doctrine).toBeNull();
    expect(result.subsumption.allRequiredSatisfied).toBe(true);
    expect(result.conclusion.disposition).toBe(ConclusionDisposition.SUPPORTED);
    expect(result.trace.testProvenance?.articleNumber).toBe("15");
    expect(result.trace.testProvenance?.elementIds).toHaveLength(2);
    expect(() => JSON.stringify(result.trace)).not.toThrow();
  });

  it("returns INSUFFICIENT_FACTS when extracted elements have no mapped facts", async () => {
    const rule = retrievedRule({
      articleText:
        "1. Intentional criminal conduct is required. 2. Causation of the prohibited result is required.",
    });
    const orchestrator = orchestratorWith(rule);
    const result = await orchestrator.analyze({
      facts: [],
      evidence: [],
      applicableAt: "2024-06-01",
      issue,
      retrievalQuery: "Article 15",
    });
    expect(result.legalTest?.elements.length).toBe(2);
    expect(result.conclusion.disposition).toBe(
      ConclusionDisposition.INSUFFICIENT_FACTS,
    );
  });
});
