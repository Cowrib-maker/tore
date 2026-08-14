import { describe, expect, it } from "vitest";

import {
  GraphEdgeType,
  GraphNodeType,
  createKnowledgeGraph,
  documentGraphId,
  provisionGraphId,
} from "@/engine/graph";
import {
  LegalCitationRole,
  LegalDocumentStatus,
  LegalNodeKind,
  LegalRelationType,
  LegalSourceKind,
  type LegalDocument,
  type LegalNode,
} from "@/engine/knowledge/schema";

function provision(partial: {
  id: string;
  kind: LegalNode["kind"];
  heading?: string;
  children?: LegalNode[];
  citations?: LegalNode["citations"];
}): LegalNode {
  return {
    id: partial.id,
    kind: partial.kind,
    locator: { display: partial.id, article: "17" },
    heading: partial.heading ?? null,
    text: partial.heading ?? partial.id,
    order: 0,
    path: partial.id,
    citations: partial.citations ?? [],
    children: partial.children ?? [],
  };
}

function lawDocument(
  id: string,
  title: string,
  hierarchy: LegalNode[],
  extras: Partial<LegalDocument> = {},
): LegalDocument {
  return {
    identity: {
      id,
      jurisdiction: "MN",
      language: "mn",
      title,
      identifiers: [],
    },
    source: {
      kind: LegalSourceKind.LAW,
      instrumentClass: "CODE",
      enactingBody: null,
    },
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
    citations: extras.citations ?? [],
    relations: extras.relations ?? [],
    ...extras,
  };
}

describe("KnowledgeGraph", () => {
  it("indexes a law tree with stable ids and CONTAINS edges", () => {
    const article = provision({
      id: "art-17",
      kind: LegalNodeKind.ARTICLE,
      heading: "17 дугаар зүйл",
      children: [
        provision({
          id: "p-1",
          kind: LegalNodeKind.PARAGRAPH,
          heading: "17.1",
          children: [
            provision({
              id: "sp-2",
              kind: LegalNodeKind.SUBPARAGRAPH,
              heading: "17.1.2",
            }),
          ],
        }),
      ],
    });
    const graph = createKnowledgeGraph();
    const document = lawDocument("criminal", "Эрүүгийн хууль", [article]);
    graph.addDocument(document);
    graph.addDocument(document);

    const lawId = documentGraphId("criminal");
    const articleId = provisionGraphId("criminal", "art-17");
    const paragraphId = provisionGraphId("criminal", "p-1");
    const subId = provisionGraphId("criminal", "sp-2");

    expect(graph.findNode(lawId)?.type).toBe(GraphNodeType.LAW);
    expect(graph.findNode(articleId)?.type).toBe(GraphNodeType.ARTICLE);
    expect(graph.findNode(paragraphId)?.type).toBe(GraphNodeType.PARAGRAPH);
    expect(graph.findNode(subId)?.type).toBe(GraphNodeType.SUBPARAGRAPH);
    expect(graph.findByType(GraphNodeType.LAW)).toHaveLength(1);
    expect(graph.findByType(GraphNodeType.ARTICLE)).toHaveLength(1);

    const lawNeighbors = graph.neighbors(lawId, {
      direction: "OUT",
      edgeTypes: [GraphEdgeType.CONTAINS],
    });
    expect(lawNeighbors.map((item) => item.node.id)).toEqual([articleId]);
    expect(
      graph.neighbors(articleId, {
        direction: "OUT",
        edgeTypes: [GraphEdgeType.CONTAINS],
      })[0]?.node.id,
    ).toBe(paragraphId);
  });

  it("records CITES, AMENDS, REFERS_TO and resolves related authorities", () => {
    const citedArticle = provision({
      id: "art-17",
      kind: LegalNodeKind.ARTICLE,
      heading: "17 дугаар зүйл",
    });
    const citingArticle = provision({
      id: "art-3",
      kind: LegalNodeKind.ARTICLE,
      heading: "3 дугаар зүйл",
      citations: [
        {
          id: "c1",
          rawText: "17 дугаар зүйл",
          role: LegalCitationRole.CITES,
          fromNodeId: null,
          target: { type: "INTERNAL_NODE", nodeId: "art-17" },
        },
      ],
    });
    const criminal = lawDocument("criminal", "Эрүүгийн хууль", [
      citedArticle,
      citingArticle,
    ]);
    const amendment = lawDocument("amendment", "Нэмэлт хууль", [], {
      relations: [
        {
          type: LegalRelationType.AMENDS,
          target: { type: "DOCUMENT", documentId: "criminal" },
        },
      ],
      citations: [
        {
          id: "c2",
          rawText: "бусад эх сурвалж",
          role: LegalCitationRole.CITES,
          fromNodeId: null,
          target: { type: "UNRESOLVED", rawText: "бусад эх сурвалж" },
        },
      ],
    });

    const graph = createKnowledgeGraph();
    graph.addDocument(criminal);
    graph.addDocument(amendment);

    const art3 = provisionGraphId("criminal", "art-3");
    const art17 = provisionGraphId("criminal", "art-17");
    const cites = graph.neighbors(art3, {
      direction: "OUT",
      edgeTypes: [GraphEdgeType.CITES],
    });
    expect(cites).toHaveLength(1);
    expect(cites[0]?.node.id).toBe(art17);
    expect(cites[0]?.edge.evidence).toEqual(["17 дугаар зүйл"]);

    const amendmentId = documentGraphId("amendment");
    const amends = graph.neighbors(amendmentId, {
      direction: "OUT",
      edgeTypes: [GraphEdgeType.AMENDS],
    });
    expect(amends[0]?.node.id).toBe(documentGraphId("criminal"));
    expect(amends[0]?.node.type).toBe(GraphNodeType.LAW);

    const refers = graph.neighbors(amendmentId, {
      direction: "OUT",
      edgeTypes: [GraphEdgeType.REFERS_TO],
    });
    expect(refers).toHaveLength(1);
    expect(refers[0]?.node.type).toBe(GraphNodeType.AUTHORITY);

    const related = graph.findRelated(amendmentId);
    expect(related.map((node) => node.id)).toContain(documentGraphId("criminal"));
    expect(related.map((node) => node.type)).not.toContain(GraphNodeType.ARTICLE);
  });

  it("maps court, regulation, and commentary document types", () => {
    const graph = createKnowledgeGraph();
    graph.addDocument({
      ...lawDocument("sc", "Тогтоол", []),
      source: {
        kind: LegalSourceKind.SUPREME_COURT_DECISION,
        court: "Улсын дээд шүүх",
        caseNumber: "123",
        decisionType: "RESOLUTION",
        parties: [],
        disposition: null,
      },
    });
    graph.addDocument({
      ...lawDocument("reg", "Журам", []),
      source: {
        kind: LegalSourceKind.GOVERNMENT_REGULATION,
        issuingBody: "Засгийн газар",
        regulationNumber: "1",
        enablingAuthority: { type: "DOCUMENT", documentId: "criminal" },
      },
    });
    graph.addDocument({
      ...lawDocument("note", "Тайлбар", []),
      source: {
        kind: LegalSourceKind.LEGAL_COMMENTARY,
        authors: [],
        workTitle: "Тайлбар",
        commentedAuthority: { type: "DOCUMENT", documentId: "criminal" },
      },
    });

    expect(graph.findNode(documentGraphId("sc"))?.type).toBe(
      GraphNodeType.SUPREME_COURT_RESOLUTION,
    );
    expect(graph.findByType(GraphNodeType.GOVERNMENT_REGULATION)).toHaveLength(1);
    expect(
      graph.neighbors(documentGraphId("reg"), {
        direction: "OUT",
        edgeTypes: [GraphEdgeType.IMPLEMENTS],
      })[0]?.node.id,
    ).toBe(documentGraphId("criminal"));
    expect(
      graph.neighbors(documentGraphId("note"), {
        direction: "OUT",
        edgeTypes: [GraphEdgeType.INTERPRETS],
      })[0]?.node.id,
    ).toBe(documentGraphId("criminal"));
  });
});
