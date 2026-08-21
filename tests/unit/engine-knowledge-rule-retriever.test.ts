import { describe, expect, it } from "vitest";

import {
  ConclusionDisposition,
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  KnowledgeRuleRetriever,
  LegalAuthorityKind,
  LegalDomain,
  LegalIssueKind,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  createCaseAnalysisOrchestrator,
  createDoctrineEngine,
  emptyTemporal,
  type LegalDoctrine,
  type LegalElement,
  type LegalIssue,
  type LegalTest,
} from "@/engine/doctrine";
import {
  InMemoryKnowledgeRepository,
  KnowledgeDocumentKind,
  KnowledgeMatchKinds,
  type StoredKnowledgeDocument,
} from "@/engine/knowledge";
import { sha256Hex } from "@/engine/data/archive";
import { PrismaKnowledgeRepository } from "@/infrastructure/repositories/prisma-legal-knowledge-repository";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function baseDoc(
  overrides: Partial<StoredKnowledgeDocument> &
    Pick<StoredKnowledgeDocument, "id" | "title" | "sourceUrl">,
): StoredKnowledgeDocument {
  return {
    sourceId: "legalinfo",
    kind: KnowledgeDocumentKind.HTML,
    metadata: {
      title: overrides.title,
      language: "en",
      jurisdiction: "MN",
      documentType: "LAW",
      sourceUrl: overrides.sourceUrl,
      articleCount: 1,
      validFrom: "2020-01-01",
      validTo: null,
      sourceVersion: "v1",
    },
    articles: [],
    chunks: [],
    ingestedAt: new Date("2024-01-01T00:00:00.000Z"),
    provenance: {
      archiveId: `archive:${overrides.id}`,
      sha256: sha256Hex(bytes(overrides.id)),
      originalUrl: overrides.sourceUrl,
      lawId: "1",
    },
    ...overrides,
  };
}

async function seedCriminalRepo() {
  const repo = new InMemoryKnowledgeRepository();
  await repo.save(
    baseDoc({
      id: "doc:criminal",
      title: "Criminal Code fixture",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=criminal",
      metadata: {
        title: "Criminal Code fixture",
        language: "en",
        jurisdiction: "MN",
        documentType: "CRIMINAL_CODE",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=criminal",
        articleCount: 2,
        validFrom: "2015-01-01",
        validTo: "2025-12-31",
        sourceVersion: "v2",
      },
      articles: [
        {
          id: "article:crim-15",
          articleNumber: "15",
          title: "Elements of offense",
          text: "The offense elements require intentional criminal conduct and causation.",
          order: 1,
        },
        {
          id: "article:crim-20",
          articleNumber: "20",
          title: "Culpability",
          text: "Culpability requires intent or negligence.",
          order: 2,
        },
      ],
      chunks: [
        {
          id: "chunk:crim-15",
          documentId: "doc:criminal",
          articleNumber: "15",
          order: 1,
          text: "The offense elements require intentional criminal conduct and causation.",
          tokenEstimate: 12,
        },
      ],
    }),
  );
  return repo;
}

async function seedCivilRepo() {
  const repo = new InMemoryKnowledgeRepository();
  await repo.save(
    baseDoc({
      id: "doc:civil",
      title: "Civil Code contract obligations",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=civil",
      metadata: {
        title: "Civil Code contract obligations",
        language: "en",
        jurisdiction: "MN",
        documentType: "CONTRACT",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=civil",
        articleCount: 1,
        validFrom: "2018-01-01",
        validTo: null,
        sourceVersion: "v1",
      },
      articles: [
        {
          id: "article:civ-8",
          articleNumber: "8",
          title: "Breach of obligation",
          text: "A party that breaches a civil obligation is liable for damages.",
          order: 1,
        },
      ],
      chunks: [
        {
          id: "chunk:civ-8",
          documentId: "doc:civil",
          articleNumber: "8",
          order: 1,
          text: "A party that breaches a civil obligation is liable for damages.",
          tokenEstimate: 14,
        },
      ],
    }),
  );
  return repo;
}

async function seedAdminRepo() {
  const repo = new InMemoryKnowledgeRepository();
  await repo.save(
    baseDoc({
      id: "doc:admin",
      title: "Administrative procedure legality",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=admin",
      metadata: {
        title: "Administrative procedure legality",
        language: "en",
        jurisdiction: "MN",
        documentType: "LAW",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=admin",
        articleCount: 1,
        validFrom: "2019-01-01",
        validTo: null,
        sourceVersion: "v1",
      },
      articles: [
        {
          id: "article:adm-3",
          articleNumber: "3",
          title: "Competence",
          text: "An administrative agency must act within its competence and jurisdiction.",
          order: 1,
        },
      ],
      chunks: [
        {
          id: "chunk:adm-3",
          documentId: "doc:admin",
          articleNumber: "3",
          order: 1,
          text: "An administrative agency must act within its competence and jurisdiction.",
          tokenEstimate: 12,
        },
      ],
    }),
  );
  return repo;
}

describe("KnowledgeRuleRetriever", () => {
  it("retrieves by exact article number with source URL and provenance", async () => {
    const repo = await seedCriminalRepo();
    const retriever = new KnowledgeRuleRetriever(repo);

    const rules = await retriever.retrieve({
      issueStatement: "Article 15 offense elements",
      query: "Article 15",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-06-01",
    });

    expect(rules).toHaveLength(1);
    expect(rules[0]?.articleNumber).toBe("15");
    expect(rules[0]?.sourceUrl).toContain("legalinfo.mn");
    expect(rules[0]?.officialUrl).toContain("legalinfo.mn");
    expect(rules[0]?.legalDocumentId).toBe("doc:criminal");
    expect(rules[0]?.articleId).toBe("article:crim-15");
    expect(rules[0]?.chunkId).toBe("chunk:crim-15");
    expect(rules[0]?.matchKind).toBe(KnowledgeMatchKinds.ARTICLE_NUMBER);
    expect(rules[0]?.rule.provenance[0]?.sourceKind).toBe(
      LegalAuthorityKind.POSITIVE_LAW,
    );
    expect(rules[0]?.supportStatus).toBe("SOURCE_BACKED");
  });

  it("retrieves by title/concept and keeps chunk-level provenance", async () => {
    const repo = await seedCivilRepo();
    const retriever = new KnowledgeRuleRetriever(repo);

    const rules = await retriever.retrieve({
      issueStatement: "breach of civil obligation damages",
      query: "breach of civil obligation",
      domain: LegalDomain.CIVIL,
      issueKind: LegalIssueKind.BREACH,
      applicableAt: "2024-01-01",
    });

    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]?.chunkId).toBe("chunk:civ-8");
    expect(rules[0]?.articleNumber).toBe("8");
    expect(rules[0]?.title).toMatch(/Breach/i);
    expect(rules[0]?.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("filters historically by applicableAt", async () => {
    const repo = await seedCriminalRepo();
    const retriever = new KnowledgeRuleRetriever(repo);

    const historical = await retriever.retrieve({
      issueStatement: "Article 15",
      query: "Article 15",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2012-01-01",
    });
    expect(historical).toHaveLength(0);

    const inForce = await retriever.retrieve({
      issueStatement: "Article 15",
      query: "Article 15",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2020-06-01",
    });
    expect(inForce).toHaveLength(1);
    expect(inForce[0]?.temporal.validFrom).toBe("2015-01-01");
  });

  it("supports criminal, civil, and administrative domain filtering", async () => {
    const criminal = new KnowledgeRuleRetriever(await seedCriminalRepo());
    const civil = new KnowledgeRuleRetriever(await seedCivilRepo());
    const admin = new KnowledgeRuleRetriever(await seedAdminRepo());

    const cr = await criminal.retrieve({
      issueStatement: "criminal offense elements",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-01-01",
    });
    const ci = await civil.retrieve({
      issueStatement: "civil obligation breach",
      domain: LegalDomain.CIVIL,
      applicableAt: "2024-01-01",
    });
    const ad = await admin.retrieve({
      issueStatement: "administrative competence jurisdiction",
      domain: LegalDomain.ADMINISTRATIVE,
      applicableAt: "2024-01-01",
    });

    expect(cr[0]?.legalDocumentId).toBe("doc:criminal");
    expect(ci[0]?.legalDocumentId).toBe("doc:civil");
    expect(ad[0]?.legalDocumentId).toBe("doc:admin");
  });

  it("returns empty when no authoritative knowledge match exists", async () => {
    const repo = new InMemoryKnowledgeRepository();
    const retriever = new KnowledgeRuleRetriever(repo);
    const rules = await retriever.retrieve({
      issueStatement: "nonexistent doctrine invention",
      applicableAt: "2024-01-01",
    });
    expect(rules).toEqual([]);
  });

  it("never uses LLM as authority and rejects court/AI document types", async () => {
    const repo = new InMemoryKnowledgeRepository();
    await repo.save(
      baseDoc({
        id: "doc:court",
        title: "Court decision commentary",
        sourceUrl: "https://example.test/court/1",
        metadata: {
          title: "Court decision commentary",
          language: "en",
          jurisdiction: "MN",
          documentType: "COURT_DECISION",
          sourceUrl: "https://example.test/court/1",
          articleCount: 1,
          validFrom: "2020-01-01",
          validTo: null,
          sourceVersion: "v1",
        },
        articles: [
          {
            id: "a1",
            articleNumber: "1",
            title: "Holding",
            text: "The court held that criminal offense elements were met.",
            order: 1,
          },
        ],
        chunks: [],
      }),
    );

    const retriever = new KnowledgeRuleRetriever(repo);
    const rules = await retriever.retrieve({
      issueStatement: "Article 1 criminal offense",
      query: "Article 1",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-01-01",
    });
    expect(rules).toEqual([]);
  });

  it("wires into case analysis: no rule → UNSUPPORTED", async () => {
    const engine = createDoctrineEngine({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
    });
    const result = await engine.analyzeCase({
      facts: [
        {
          id: "f1",
          statement: "criminal offense conduct",
          elementId: null,
          disputed: false,
        },
      ],
      evidence: [],
      applicableAt: "2024-01-01",
      retrievalQuery: "Article 999 nonexistent",
    });
    expect(result.retrievedRules).toHaveLength(0);
    expect(result.conclusion.disposition).toBe(ConclusionDisposition.UNSUPPORTED);
  });

  it("wires into case analysis: insufficient facts → INSUFFICIENT_FACTS", async () => {
    const repo = await seedCriminalRepo();
    const classifier = new RuleBasedLegalDomainClassifier();
    const orchestrator = createCaseAnalysisOrchestrator({
      issueSpotter: new RuleBasedIssueSpotter(classifier),
      ruleRetriever: new KnowledgeRuleRetriever(repo),
      classifier,
      criminalFramework: new EmptyCriminalDoctrineFramework(),
      civilFramework: new EmptyCivilDoctrineFramework(),
      administrativeFramework: new EmptyAdministrativeDoctrineFramework(),
    });

    const el: LegalElement = {
      id: "el:1",
      label: "Conduct",
      description: "Required conduct",
      required: true,
      order: 1,
      conceptId: null,
      temporal: emptyTemporal({ validFrom: "2015-01-01" }),
      provenance: [
        {
          sourceId: "fixture",
          sourceKind: LegalAuthorityKind.DOCTRINE,
          citation: "fixture",
          locator: "§1",
        },
      ],
    };
    const issue: LegalIssue = {
      id: "issue:1",
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
    const doctrine: LegalDoctrine = {
      id: "doctrine:1",
      name: "Fixture",
      statement: "Fixture doctrine",
      domain: LegalDomain.CRIMINAL,
      relatedPositiveLawIds: ["1"],
      relatedCourtDecisionIds: [],
      concepts: [],
      temporal: emptyTemporal({ validFrom: "2015-01-01" }),
      provenance: [
        {
          sourceId: "treatise",
          sourceKind: LegalAuthorityKind.DOCTRINE,
          citation: "fixture",
          locator: "§1",
        },
      ],
    };
    const legalTest: LegalTest = {
      id: "test:1",
      name: "Elements",
      doctrineId: doctrine.id,
      ruleId: null,
      elements: [el],
      temporal: emptyTemporal({ validFrom: "2015-01-01" }),
      provenance: doctrine.provenance,
    };

    const result = await orchestrator.analyze({
      facts: [],
      evidence: [],
      applicableAt: "2024-06-01",
      issue,
      doctrine,
      legalTest,
      retrievalQuery: "Article 15",
    });

    expect(result.retrievedRules.length).toBeGreaterThan(0);
    expect(result.trace.ruleProvenance[0]?.articleNumber).toBe("15");
    expect(result.conclusion.disposition).toBe(
      ConclusionDisposition.INSUFFICIENT_FACTS,
    );
    expect(() => JSON.stringify(result.trace)).not.toThrow();
  });

  it("surfaces CONFLICTING_AUTHORITY for competing grounded rules", async () => {
    const repo = new InMemoryKnowledgeRepository();
    await repo.save(
      baseDoc({
        id: "doc:a",
        title: "Criminal Code A",
        sourceUrl: "https://legalinfo.mn/a",
        metadata: {
          title: "Criminal Code A",
          language: "en",
          jurisdiction: "MN",
          documentType: "CRIMINAL_CODE",
          sourceUrl: "https://legalinfo.mn/a",
          articleCount: 1,
          validFrom: "2010-01-01",
          validTo: null,
          sourceVersion: "a",
        },
        articles: [
          {
            id: "a-15",
            articleNumber: "15",
            title: "Rule A",
            text: "Version A of the offense elements.",
            order: 1,
          },
        ],
        chunks: [
          {
            id: "c-a",
            documentId: "doc:a",
            articleNumber: "15",
            order: 1,
            text: "Version A of the offense elements.",
            tokenEstimate: 8,
          },
        ],
      }),
    );
    await repo.save(
      baseDoc({
        id: "doc:b",
        title: "Criminal Code B",
        sourceUrl: "https://legalinfo.mn/b",
        metadata: {
          title: "Criminal Code B",
          language: "en",
          jurisdiction: "MN",
          documentType: "CRIMINAL_CODE",
          sourceUrl: "https://legalinfo.mn/b",
          articleCount: 1,
          validFrom: "2010-01-01",
          validTo: null,
          sourceVersion: "b",
        },
        articles: [
          {
            id: "b-15",
            articleNumber: "15",
            title: "Rule B",
            text: "Version B of the offense elements differs.",
            order: 1,
          },
        ],
        chunks: [
          {
            id: "c-b",
            documentId: "doc:b",
            articleNumber: "15",
            order: 1,
            text: "Version B of the offense elements differs.",
            tokenEstimate: 8,
          },
        ],
      }),
    );

    const classifier = new RuleBasedLegalDomainClassifier();
    const orchestrator = createCaseAnalysisOrchestrator({
      issueSpotter: new RuleBasedIssueSpotter(classifier),
      ruleRetriever: new KnowledgeRuleRetriever(repo),
      classifier,
      criminalFramework: new EmptyCriminalDoctrineFramework(),
      civilFramework: new EmptyCivilDoctrineFramework(),
      administrativeFramework: new EmptyAdministrativeDoctrineFramework(),
    });

    const result = await orchestrator.analyze({
      facts: [
        {
          id: "f1",
          statement: "criminal offense",
          elementId: "el:1",
          disputed: false,
        },
      ],
      evidence: [],
      applicableAt: "2024-01-01",
      retrievalQuery: "Article 15",
      issue: {
        id: "issue:conflict",
        statement: "Article 15 offense",
        domain: LegalDomain.CRIMINAL,
        classification: {
          domain: LegalDomain.CRIMINAL,
          topics: [],
          nature: "SUBSTANTIVE",
          confidence: 0.6,
        },
        temporal: emptyTemporal({ applicableAt: "2024-01-01" }),
        provenance: [],
        unresolved: false,
      },
    });

    expect(result.retrievedRules.length).toBeGreaterThanOrEqual(2);
    expect(result.conclusion.disposition).toBe(
      ConclusionDisposition.CONFLICTING_AUTHORITY,
    );
  });

  it("keeps in-memory repository search compatible", async () => {
    const repo = await seedCriminalRepo();
    const hits = await repo.searchArticles({
      articleNumber: "15",
      domain: "CRIMINAL",
      limit: 5,
    });
    expect(hits[0]?.articleNumber).toBe("15");
    expect(hits[0]?.chunkId).toBe("chunk:crim-15");
  });

  it("does not depend on an LLM for rule text or authority", async () => {
    const repo = await seedCriminalRepo();
    const retriever = new KnowledgeRuleRetriever(repo);
    const rules = await retriever.retrieve({
      issueStatement: "Article 15",
      query: "Article 15",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-06-01",
    });
    expect(rules[0]?.rule.provenance.every((p) => p.sourceKind !== LegalAuthorityKind.AI_INFERENCE)).toBe(
      true,
    );
    expect(rules[0]?.rule.statement).toContain("The offense elements require");
    expect(rules[0]?.rule.provenance[0]?.retrievedAt).toBeTruthy();
    expect(rules[0]?.temporal.sourceVersion).toBe("v2");
    expect(rules[0]?.temporal.applicableAt).toBe("2024-06-01");
  });

  it("does not treat a weak title overlap as SOURCE_BACKED", async () => {
    const repo = await seedCriminalRepo();
    const retriever = new KnowledgeRuleRetriever(repo);
    const rules = await retriever.retrieve({
      issueStatement: "fixture",
      query: "fixture",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-06-01",
    });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.supportStatus !== "SOURCE_BACKED")).toBe(true);
    expect(rules[0]?.supportStatus).toBe("PARTIAL");
  });

  it("filters mixed-domain corpus without inventing rules", async () => {
    const repo = new InMemoryKnowledgeRepository();
    const criminal = await seedCriminalRepo();
    const civil = await seedCivilRepo();
    const admin = await seedAdminRepo();
    for (const doc of [
      ...(await criminal.list()),
      ...(await civil.list()),
      ...(await admin.list()),
    ]) {
      await repo.save(doc);
    }
    const retriever = new KnowledgeRuleRetriever(repo);

    const cr = await retriever.retrieve({
      issueStatement: "Article 15",
      query: "Article 15",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-01-01",
    });
    const ci = await retriever.retrieve({
      issueStatement: "breach of civil obligation",
      query: "breach of civil obligation",
      domain: LegalDomain.CIVIL,
      applicableAt: "2024-01-01",
    });
    const ad = await retriever.retrieve({
      issueStatement: "administrative competence jurisdiction",
      domain: LegalDomain.ADMINISTRATIVE,
      applicableAt: "2024-01-01",
    });

    expect(cr.map((r) => r.legalDocumentId)).toEqual(["doc:criminal"]);
    expect(ci.map((r) => r.legalDocumentId)).toEqual(["doc:civil"]);
    expect(ad.map((r) => r.legalDocumentId)).toEqual(["doc:admin"]);
  });

  it("selects the historically applicable version, not the current one", async () => {
    const repo = new InMemoryKnowledgeRepository();
    await repo.save(
      baseDoc({
        id: "doc:old",
        title: "Criminal Code historical",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=criminal-old",
        metadata: {
          title: "Criminal Code historical",
          language: "en",
          jurisdiction: "MN",
          documentType: "CRIMINAL_CODE",
          sourceUrl: "https://legalinfo.mn/mn/detail?lawId=criminal-old",
          articleCount: 1,
          validFrom: "2010-01-01",
          validTo: "2015-12-31",
          sourceVersion: "old",
        },
        articles: [
          {
            id: "old-15",
            articleNumber: "15",
            title: "Old elements",
            text: "Historical version of offense elements.",
            order: 1,
          },
        ],
        chunks: [
          {
            id: "chunk:old-15",
            documentId: "doc:old",
            articleNumber: "15",
            order: 1,
            text: "Historical version of offense elements.",
            tokenEstimate: 6,
          },
        ],
      }),
    );
    await repo.save(
      baseDoc({
        id: "doc:new",
        title: "Criminal Code current",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=criminal-new",
        metadata: {
          title: "Criminal Code current",
          language: "en",
          jurisdiction: "MN",
          documentType: "CRIMINAL_CODE",
          sourceUrl: "https://legalinfo.mn/mn/detail?lawId=criminal-new",
          articleCount: 1,
          validFrom: "2016-01-01",
          validTo: null,
          sourceVersion: "new",
        },
        articles: [
          {
            id: "new-15",
            articleNumber: "15",
            title: "New elements",
            text: "Current version of offense elements.",
            order: 1,
          },
        ],
        chunks: [
          {
            id: "chunk:new-15",
            documentId: "doc:new",
            articleNumber: "15",
            order: 1,
            text: "Current version of offense elements.",
            tokenEstimate: 6,
          },
        ],
      }),
    );

    const retriever = new KnowledgeRuleRetriever(repo);
    const historical = await retriever.retrieve({
      issueStatement: "Article 15",
      query: "Article 15",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2012-06-01",
    });
    const current = await retriever.retrieve({
      issueStatement: "Article 15",
      query: "Article 15",
      domain: LegalDomain.CRIMINAL,
      applicableAt: "2024-06-01",
    });

    expect(historical).toHaveLength(1);
    expect(historical[0]?.legalDocumentId).toBe("doc:old");
    expect(historical[0]?.temporal.sourceVersion).toBe("old");
    expect(current).toHaveLength(1);
    expect(current[0]?.legalDocumentId).toBe("doc:new");
    expect(current[0]?.temporal.sourceVersion).toBe("new");
  });
});

describe("PrismaKnowledgeRepository.searchArticles compatibility", () => {
  it("filters via article findMany without list()-scanning the corpus", async () => {
    type DocRow = {
      id: string;
      sourceId: string;
      sourceUrl: string;
      lawId: string | null;
      title: string;
      kind: string;
      language: string;
      jurisdiction: string;
      documentType: string | null;
      articleCount: number;
      chunkCount: number;
      contentSha256: string;
      archiveId: string;
      version: number;
      ingestedAt: Date;
      articles: Array<{
        id: string;
        documentId: string;
        articleNumber: string | null;
        title: string | null;
        text: string;
        order: number;
      }>;
      chunks: Array<{
        id: string;
        documentId: string;
        articleNumber: string | null;
        order: number;
        text: string;
        tokenEstimate: number;
      }>;
    };

    const documents = new Map<string, DocRow>();
    documents.set("doc:prisma-1", {
      id: "doc:prisma-1",
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=99",
      lawId: "99",
      title: "Criminal Code prisma fixture",
      kind: "html",
      language: "en",
      jurisdiction: "MN",
      documentType: "CRIMINAL_CODE",
      articleCount: 1,
      chunkCount: 1,
      contentSha256: "abc",
      archiveId: "arch-1",
      version: 1,
      ingestedAt: new Date(),
      articles: [
        {
          id: "prisma-art-15",
          documentId: "doc:prisma-1",
          articleNumber: "15",
          title: "Offense",
          text: "Criminal offense elements.",
          order: 1,
        },
      ],
      chunks: [
        {
          id: "prisma-chunk-15",
          documentId: "doc:prisma-1",
          articleNumber: "15",
          order: 1,
          text: "Criminal offense elements.",
          tokenEstimate: 4,
        },
      ],
    });

    let articleFindManyCalls = 0;
    let listCalls = 0;
    let chunkFindManyCalls = 0;

    const fakeDb = {
      legalKnowledgeDocument: {
        async findMany() {
          listCalls += 1;
          return [...documents.values()];
        },
        async findUnique() {
          return null;
        },
        async findFirst() {
          return null;
        },
      },
      legalKnowledgeArticle: {
        async findMany({
          take,
          include,
        }: {
          where?: unknown;
          take?: number;
          include?: unknown;
        }) {
          articleFindManyCalls += 1;
          const rows = [...documents.values()].flatMap((doc) =>
            doc.articles
              .filter((a) => a.articleNumber === "15")
              .map((article) => ({
                ...article,
                document: include
                  ? {
                      ...doc,
                      validFrom: "2015-01-01",
                      validTo: "2025-12-31",
                      sourceVersion: "v1",
                      articles: doc.articles,
                      chunks: doc.chunks,
                    }
                  : undefined,
              })),
          );
          return rows.slice(0, take ?? 20);
        },
      },
      legalKnowledgeChunk: {
        async findMany() {
          chunkFindManyCalls += 1;
          return [];
        },
      },
    };

    const knowledge = new PrismaKnowledgeRepository(
      { verifyArchiveIntegrity: async () => {
        throw new Error("unused");
      } } as never,
      fakeDb as never,
    );

    const hits = await knowledge.searchArticles({
      text: "Article 15",
      domain: "CRIMINAL",
      limit: 5,
    });

    expect(articleFindManyCalls).toBe(1);
    expect(listCalls).toBe(0);
    expect(chunkFindManyCalls).toBe(0);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.articleNumber).toBe("15");
    expect(hits[0]?.chunkId).toBe("prisma-chunk-15");
    expect(hits[0]?.sourceUrl).toContain("lawId=99");
    expect(hits[0]?.validFrom).toBe("2015-01-01");
  });
});
