import { describe, expect, it } from "vitest";

import { GraphEdgeType, documentGraphId, externalGraphId, provisionGraphId } from "@/engine/graph";
import { LegalIdentifierScheme } from "@/engine/knowledge/schema";
import { extractLegalInfoCrossReferences } from "@/engine/knowledge/evidence/extract-legalinfo-cross-references";
import {
  projectCitationsFromReferences,
  projectDocumentContainment,
  projectLegalInfoCitations,
} from "@/application/legal-graph/project-legal-knowledge-graph";

describe("projectDocumentContainment", () => {
  it("projects one CONTAINS edge per article, using existing article identity — no new document/citation data invented", () => {
    const edges = projectDocumentContainment({
      id: "doc-1",
      title: "Иргэний хууль",
      articles: [
        { id: "art-1", title: "Зүйл 1", articleNumber: "1" },
        { id: "art-2", title: null, articleNumber: "2" },
      ],
    });

    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      edgeType: GraphEdgeType.CONTAINS,
      fromNodeId: documentGraphId("doc-1"),
      toNodeId: provisionGraphId("doc-1", "art-1"),
      fromDocumentId: "doc-1",
      toDocumentId: "doc-1",
      fromLabel: "Иргэний хууль",
      toLabel: "Зүйл 1",
      sourceKind: "DOCUMENT_STRUCTURE",
    });
    // article with no title falls back to articleNumber, never invents a label
    expect(edges[1]!.toLabel).toBe("2");
  });

  it("produces zero edges for a document with no articles", () => {
    expect(projectDocumentContainment({ id: "doc-1", title: "Empty", articles: [] })).toEqual([]);
  });
});

describe("projectLegalInfoCitations", () => {
  const sourceHtml = `
    <html>
      <head><link rel="canonical" href="https://legalinfo.mn/mn/detail?lawId=1"></head>
      <body>
        <a href="/mn/detail?lawId=2">Холбоотой хууль</a>
      </body>
    </html>
  `;

  it("projects a CITES edge to an already-ingested target document, using the existing extractor verbatim", async () => {
    const edges = await projectLegalInfoCitations({
      sourceDocumentId: "doc-1",
      sourceTitle: "Law One",
      sourceLawId: "1",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      rawHtml: sourceHtml,
      resolveTarget: async (lawId) =>
        lawId === "2" ? { documentId: "doc-2", title: "Law Two" } : null,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      edgeType: GraphEdgeType.CITES,
      fromNodeId: documentGraphId("doc-1"),
      toNodeId: documentGraphId("doc-2"),
      toDocumentId: "doc-2",
      fromLabel: "Law One",
      toLabel: "Law Two",
      sourceKind: "LEGALINFO_CROSS_REFERENCE",
    });
    expect(edges[0]!.evidence).toContain("Холбоотой хууль");
  });

  it("still projects a CITES edge for a law that has not been ingested yet — a forward reference, not a dead-end", async () => {
    const edges = await projectLegalInfoCitations({
      sourceDocumentId: "doc-1",
      sourceTitle: "Law One",
      sourceLawId: "1",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      rawHtml: sourceHtml,
      resolveTarget: async () => null,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]!.toDocumentId).toBeNull();
    expect(edges[0]!.toNodeId).toBe(
      externalGraphId(LegalIdentifierScheme.LEGALINFO_LAW_ID, "2"),
    );
    expect(edges[0]!.toLabel).toBe("LegalInfo law 2");
  });

  it("produces no edges when the extractor finds no explicit LegalInfo detail links", async () => {
    const edges = await projectLegalInfoCitations({
      sourceDocumentId: "doc-1",
      sourceTitle: "Law One",
      sourceLawId: "1",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      rawHtml: "<html><body>no links here</body></html>",
      resolveTarget: async () => null,
    });
    expect(edges).toEqual([]);
  });

  it("never classifies AMENDS/REPEALS/SUPERSEDES — matches extractLegalInfoCrossReferences's own CITES-only scope", async () => {
    const edges = await projectLegalInfoCitations({
      sourceDocumentId: "doc-1",
      sourceTitle: "Law One",
      sourceLawId: "1",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      rawHtml: sourceHtml,
      resolveTarget: async () => null,
    });
    expect(edges.every((edge) => edge.edgeType === GraphEdgeType.CITES)).toBe(true);
  });
});

describe("projectCitationsFromReferences", () => {
  it("produces the same edges as projectLegalInfoCitations, given the same already-extracted references — used by the batch population script to avoid re-parsing HTML it already decoded once", async () => {
    const rawHtml = `<html><body><a href="/mn/detail?lawId=2">ref</a></body></html>`;
    const references = extractLegalInfoCrossReferences({
      sourceLawId: "1",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      rawHtml,
    });

    const viaWrapper = await projectLegalInfoCitations({
      sourceDocumentId: "doc-1",
      sourceTitle: "Law One",
      sourceLawId: "1",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      rawHtml,
      resolveTarget: async (lawId) => (lawId === "2" ? { documentId: "doc-2", title: "Law Two" } : null),
    });
    const viaDirect = await projectCitationsFromReferences(
      "doc-1",
      "Law One",
      references,
      async (lawId) => (lawId === "2" ? { documentId: "doc-2", title: "Law Two" } : null),
    );

    expect(viaDirect).toEqual(viaWrapper);
    expect(viaDirect).toHaveLength(1);
    expect(viaDirect[0]).toMatchObject({ toDocumentId: "doc-2", toLabel: "Law Two" });
  });

  it("still handles an unresolved target when called directly with pre-extracted references", async () => {
    const references = extractLegalInfoCrossReferences({
      sourceLawId: "1",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      rawHtml: `<html><body><a href="/mn/detail?lawId=999">ref</a></body></html>`,
    });
    const edges = await projectCitationsFromReferences("doc-1", "Law One", references, async () => null);
    expect(edges[0]!.toDocumentId).toBeNull();
    expect(edges[0]!.toNodeId).toBe(externalGraphId(LegalIdentifierScheme.LEGALINFO_LAW_ID, "999"));
  });
});
