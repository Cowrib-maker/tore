import { describe, expect, it } from "vitest";

import { buildCitationIndex } from "@/engine/citation";
import { documentGraphId, createKnowledgeGraph } from "@/engine/graph";
import {
  LegalDocumentStatus,
  LegalNodeKind,
  LegalRelationType,
  LegalSourceKind,
  type LegalDocument,
  type LegalNode,
} from "@/engine/knowledge/schema";
import {
  RetrievalStrategyId,
  createRetrievalEngine,
  type IRetrievalRanker,
  type RetrievalHit,
} from "@/engine/retrieval";

function node(partial: {
  id: string;
  kind: LegalNode["kind"];
  locator?: LegalNode["locator"];
  children?: LegalNode[];
}): LegalNode {
  return {
    id: partial.id,
    kind: partial.kind,
    locator: partial.locator ?? { display: partial.id },
    heading: partial.id,
    text: partial.id,
    order: 0,
    path: partial.id,
    citations: [],
    children: partial.children ?? [],
  };
}

function baseDocument(
  id: string,
  title: string,
  source: LegalDocument["source"],
  hierarchy: LegalNode[] = [],
  extras: Partial<LegalDocument> = {},
): LegalDocument {
  return {
    identity: {
      id,
      jurisdiction: "MN",
      language: "en",
      title,
      identifiers: [],
    },
    source,
    publication: {
      issuer: null,
      officialUrl: null,
      documentNumber: null,
      issuedOn: null,
      publishedOn: null,
      publicationSeries: null,
    },
    temporal: {
      status: LegalDocumentStatus.IN_FORCE,
      effectiveOn: null,
      validFrom: null,
      validTo: null,
    },
    hierarchy,
    citations: [],
    relations: extras.relations ?? [],
    ...extras,
  };
}

function criminalCode(): LegalDocument {
  return baseDocument(
    "criminal",
    "Criminal Code",
    { kind: LegalSourceKind.LAW, instrumentClass: "CODE", enactingBody: null },
    [
      node({
        id: "art-17",
        kind: LegalNodeKind.ARTICLE,
        locator: { display: "17", article: "17" },
        children: [
          node({
            id: "p-1",
            kind: LegalNodeKind.PARAGRAPH,
            locator: { display: "17.1", article: "17", paragraph: "1" },
          }),
        ],
      }),
    ],
  );
}

describe("RetrievalService", () => {
  const engine = createRetrievalEngine();

  it("retrieves exact citations, provisions, neighbors, and related authorities", () => {
    const criminal = criminalCode();
    const court = baseDocument("sc-1", "Resolution 1", {
      kind: LegalSourceKind.SUPREME_COURT_DECISION,
      court: "Supreme Court",
      caseNumber: "1",
      decisionType: "RESOLUTION",
      parties: [],
      disposition: null,
    });
    const guideline = baseDocument("pg-1", "Guideline 1", {
      kind: LegalSourceKind.PROSECUTOR_GUIDELINE,
      issuingOffice: "PGO",
      guidelineNumber: "1",
      audience: null,
    });
    const amendment = baseDocument(
      "amendment",
      "Amendment Law",
      { kind: LegalSourceKind.LAW, instrumentClass: "AMENDMENT", enactingBody: null },
      [],
      {
        relations: [
          {
            type: LegalRelationType.AMENDS,
            target: { type: "DOCUMENT", documentId: "criminal" },
          },
        ],
      },
    );

    const graph = createKnowledgeGraph();
    graph.addDocument(criminal);
    graph.addDocument(court);
    graph.addDocument(guideline);
    graph.addDocument(amendment);

    const plan = engine.retrieve({
      question: "Does 17.1 apply to this charge?",
      intent: { type: "CRIMINAL_LAW", confidence: 0.8 },
      citations: [
        {
          query: "17.1",
          resolved: true,
          nodeId: "p-1",
          documentId: "criminal",
          canonical: "17.1",
          kind: "PARAGRAPH",
        },
      ],
      documents: [criminal, court, guideline, amendment],
      citationIndex: [
        buildCitationIndex(criminal),
        buildCitationIndex(court),
        buildCitationIndex(guideline),
        buildCitationIndex(amendment),
      ],
      graph,
    });

    expect(plan.retrievedArticles.map((item) => item.id)).toContain("p-1");
    expect(plan.relatedCases.some((item) => item.kind === "SUPREME_COURT_RESOLUTION")).toBe(
      true,
    );
    expect(plan.relatedGuidelines.some((item) => item.kind === "PROSECUTOR_GUIDELINE")).toBe(
      true,
    );
    expect(plan.retrievedAuthorities.some((item) => item.kind === "LAW")).toBe(true);
    expect(plan.graphNeighbors.length).toBeGreaterThan(0);
    expect(plan.retrievalStrategy).toEqual(
      expect.arrayContaining([
        RetrievalStrategyId.EXACT_CITATION,
        RetrievalStrategyId.EXACT_PROVISION,
        RetrievalStrategyId.GRAPH_NEIGHBOR,
        RetrievalStrategyId.RELATED_AUTHORITY,
        RetrievalStrategyId.RELATED_CASE,
        RetrievalStrategyId.RELATED_GUIDELINE,
        RetrievalStrategyId.RELATED_LEGISLATION,
      ]),
    );
    expect(plan.confidence).toBeGreaterThan(0.5);
    expect(JSON.stringify(plan)).not.toMatch(/openai|claude|gemini|embedding/i);
  });

  it("returns empty results with zero confidence when nothing is supplied", () => {
    const plan = engine.retrieve({
      question: "   ",
      intent: { type: "UNKNOWN", confidence: 0 },
      citations: [],
      documents: [],
      citationIndex: {
        documentId: "none",
        documentTitle: "",
        jurisdiction: "",
        language: "en",
        grammarId: "generic",
        entries: [],
      },
      graph: createKnowledgeGraph(),
    });
    expect(plan.retrievedAuthorities).toEqual([]);
    expect(plan.retrievalStrategy).toEqual([]);
    expect(plan.confidence).toBe(0);
  });

  it("keeps the highest score when the same authority is found twice", () => {
    const criminal = criminalCode();
    const graph = createKnowledgeGraph();
    graph.addDocument(criminal);
    const plan = engine.retrieve({
      question: "17.1",
      intent: { type: "LEGAL_RESEARCH", confidence: 1 },
      citations: [
        {
          query: "17.1",
          resolved: true,
          nodeId: "p-1",
          documentId: "criminal",
          canonical: "17.1",
          kind: "PARAGRAPH",
        },
      ],
      documents: [criminal],
      citationIndex: buildCitationIndex(criminal),
      graph,
    });
    const paragraph = plan.retrievedAuthorities.filter((item) => item.id === "p-1");
    expect(paragraph).toHaveLength(1);
    expect(paragraph[0]?.score).toBe(1);
    expect(paragraph[0]?.source).toBe("citation");
  });

  it("finds related legislation through graph relations", () => {
    const criminal = criminalCode();
    const amendment = baseDocument(
      "amendment",
      "Amendment Law",
      { kind: LegalSourceKind.LAW, instrumentClass: "AMENDMENT", enactingBody: null },
      [],
      {
        relations: [
          {
            type: LegalRelationType.AMENDS,
            target: { type: "DOCUMENT", documentId: "criminal" },
          },
        ],
      },
    );
    const graph = createKnowledgeGraph();
    graph.addDocument(criminal);
    graph.addDocument(amendment);
    const plan = engine.retrieve({
      question: "amendment of the criminal code",
      intent: { type: "LEGAL_RESEARCH", confidence: 0.7 },
      citations: [],
      documents: [criminal, amendment],
      citationIndex: [buildCitationIndex(criminal), buildCitationIndex(amendment)],
      graph,
    });
    expect(plan.retrievedAuthorities.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        documentGraphId("criminal"),
        documentGraphId("amendment"),
      ]),
    );
  });

  it("accepts an injected ranker", () => {
    const ranker: IRetrievalRanker = {
      rank(hits: readonly RetrievalHit[]): RetrievalHit[] {
        return [...hits].sort((left, right) => left.id.localeCompare(right.id));
      },
    };
    const criminal = criminalCode();
    const graph = createKnowledgeGraph();
    graph.addDocument(criminal);
    const plan = createRetrievalEngine({ ranker }).retrieve({
      question: "17",
      intent: { type: "LEGAL_INFORMATION", confidence: 0.6 },
      citations: [],
      documents: [criminal],
      citationIndex: buildCitationIndex(criminal),
      graph,
    });
    expect(plan.retrievedArticles.length).toBeGreaterThan(0);
  });
});
