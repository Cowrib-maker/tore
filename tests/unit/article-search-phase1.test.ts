import { describe, expect, it } from "vitest";

import { KnowledgeDocumentKind } from "@/engine/knowledge";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge/repository";
import { resolveCanonicalLawIdentity } from "@/engine/citation/canonical-law-titles";
import { detectExactCitation } from "@/engine/citation";

describe("phase1 article search filters", () => {
  it("finds criminal code 17.1 by lawId and title terms", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save({
      id: "doc-criminal-17-1",
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
      title: "Монгол Улсын Эрүүгийн хууль",
      kind: KnowledgeDocumentKind.HTML,
      metadata: {
        title: "Монгол Улсын Эрүүгийн хууль",
        language: "mn",
        jurisdiction: "MN",
        documentType: "CRIMINAL_CODE",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
        articleCount: 1,
      },
      articles: [
        {
          id: "art-17-1",
          articleNumber: "17.1",
          title: "17.1 дүгээр зүйл",
          text: "Гэмт хэрэг гэж хуулиар хориглосон үйлдэл.",
          order: 0,
        },
      ],
      chunks: [],
      ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
      provenance: {
        archiveId: "arch-criminal-17-1",
        sha256: "sha256-criminal-17-1",
        originalUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
        lawId: "11634",
      },
    });

    const citation = detectExactCitation("Эрүүгийн хуулийн 17.1 дүгээр зүйл");
    expect(citation).not.toBeNull();
    const identity = resolveCanonicalLawIdentity(citation!);
    const hits = await knowledge.searchArticles({
      text: citation!.titleHint,
      articleNumber: "17.1",
      jurisdiction: "MN",
      titleTerms: identity.titleTerms,
      excludeTitleTerms: identity.excludeTitleTerms,
      lawId: "11634",
      limit: 20,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.articleNumber).toBe("17.1");
  });
});
