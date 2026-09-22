import { describe, expect, it } from "vitest";

import { GraphEdgeType, documentGraphId, externalGraphId, provisionGraphId } from "@/engine/graph";
import { LegalIdentifierScheme } from "@/engine/knowledge/schema";
import { extractLegalInfoCrossReferences } from "@/engine/knowledge/evidence/extract-legalinfo-cross-references";
import {
  normalizeLegalTitle,
  projectCitationsFromReferences,
  projectDocumentContainment,
  projectLegalInfoCitations,
  projectRepealDeclaration,
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

describe("projectRepealDeclaration", () => {
  // Real document lawId=9406 (see extract-legal-repeal-declaration.ts's own
  // tests for the same verbatim text) — resolves against a target already
  // in the local corpus.
  const repealDoc = {
    id: "doc-9406",
    title: "Хөдөлмөр эрхлэлтийг дэмжих тухай хууль хүчингүй болсонд тооцох тухай",
    articleOneText:
      "1 дүгээр зүйл.2001 оны 4 дүгээр сарын 19-ний өдөр баталсан Хөдөлмөр эрхлэлтийг дэмжих тухай хуулийг хүчингүй болсонд тооцсугай.",
  };

  it("projects a REPEALS edge to an already-ingested target, resolved by normalized title", async () => {
    const edges = await projectRepealDeclaration(repealDoc, async (normalizedTitle) => {
      expect(normalizedTitle).toBe(normalizeLegalTitle("Хөдөлмөр эрхлэлтийг дэмжих тухай"));
      return { documentId: "doc-310", title: "Хөдөлмөр эрхлэлтийг дэмжих тухай" };
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      edgeType: GraphEdgeType.REPEALS,
      fromNodeId: documentGraphId("doc-9406"),
      toNodeId: documentGraphId("doc-310"),
      fromDocumentId: "doc-9406",
      toDocumentId: "doc-310",
      fromLabel: repealDoc.title,
      toLabel: "Хөдөлмөр эрхлэлтийг дэмжих тухай",
      sourceKind: "LEGALINFO_REPEAL_DECLARATION",
    });
    expect(edges[0]!.evidence).toContain("хүчингүй болсонд тооцсугай");
  });

  it("still projects a REPEALS edge (as a forward reference) when the target isn't in the local corpus yet — never dropped, never guessed", async () => {
    const edges = await projectRepealDeclaration(repealDoc, async () => null);

    expect(edges).toHaveLength(1);
    expect(edges[0]!.toDocumentId).toBeNull();
    expect(edges[0]!.toLabel).toBe("Хөдөлмөр эрхлэлтийг дэмжих тухай");
    // same target name + date always resolves to the same external node id,
    // so re-running population never duplicates this forward-reference edge.
    const again = await projectRepealDeclaration(repealDoc, async () => null);
    expect(again[0]!.toNodeId).toBe(edges[0]!.toNodeId);
  });

  it("produces no edge when the document's own title is not a repeal declaration — never applies the template to unrelated documents", async () => {
    const edges = await projectRepealDeclaration(
      { id: "doc-1", title: "Иргэний хууль", articleOneText: repealDoc.articleOneText },
      async () => null,
    );
    expect(edges).toEqual([]);
  });

  it("produces no edge when the title matches but article 1's text doesn't fit the template — never guesses a partial match", async () => {
    const edges = await projectRepealDeclaration(
      { ...repealDoc, articleOneText: "1 дүгээр зүйл. Хуулийн зорилт нь энэ хуулиар зохицуулна." },
      async () => null,
    );
    expect(edges).toEqual([]);
  });
});
