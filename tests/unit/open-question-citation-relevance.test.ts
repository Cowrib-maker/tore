import { describe, expect, it } from "vitest";

import { KnowledgeDocumentKind } from "@/engine/knowledge";
import {
  documentMatchesDomain,
  inferLegalDomainFromText,
  MIN_OPEN_QUESTION_CITATION_SCORE,
  rankDocumentsToHits,
  stripLegalHtmlTags,
  tokenizeSearchTerms,
} from "@/engine/knowledge/repository/article-search";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge/repository";
import type { StoredKnowledgeDocument } from "@/engine/knowledge/types";
import { KnowledgeLegalCorpusRetriever } from "@/infrastructure/ai/knowledge-legal-corpus-retriever";

function lawDoc(input: {
  id: string;
  title: string;
  documentType?: string;
  articles: StoredKnowledgeDocument["articles"];
}): StoredKnowledgeDocument {
  return {
    id: input.id,
    sourceId: "legalinfo",
    sourceUrl: `https://legalinfo.mn/mn/detail?lawId=${input.id}`,
    title: input.title,
    kind: KnowledgeDocumentKind.HTML,
    metadata: {
      title: input.title,
      language: "mn",
      jurisdiction: "MN",
      documentType: input.documentType ?? "LAW",
      sourceUrl: `https://legalinfo.mn/mn/detail?lawId=${input.id}`,
      articleCount: input.articles.length,
      sourceVersion: "v1",
      sourceStatus: "IN_FORCE",
    },
    articles: input.articles,
    chunks: [],
    ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
    provenance: {
      archiveId: `arch-${input.id}`,
      sha256: `sha-${input.id}`,
      originalUrl: `https://legalinfo.mn/mn/detail?lawId=${input.id}`,
      lawId: input.id,
    },
  };
}

describe("open-question citation relevance", () => {
  it("infers criminal domain from police / victim language", () => {
    expect(
      inferLegalDomainFromText(
        "Намайг цагдаад дуудсан, хохирогчтой холбогдох ёстой юу?",
      ),
    ).toBe("CRIMINAL");
  });

  it("drops conversational stopwords from search tokens", () => {
    const tokens = tokenizeSearchTerms(
      "Надад тусламж хэрэгтэй байна юу цагдаа дуудсан",
    );
    expect(tokens).not.toContain("надад");
    expect(tokens).not.toContain("байна");
    expect(tokens).not.toContain("юу");
    expect(tokens.some((t) => t.includes("цагдаа") || t === "дуудсан")).toBe(
      true,
    );
  });

  it("matches эрүүгийн titles without ASCII word boundaries", () => {
    expect(
      documentMatchesDomain(
        {
          title: "Монгол Улсын Эрүүгийн хууль",
          metadata: { documentType: "LAW" },
        } as Pick<StoredKnowledgeDocument, "title" | "metadata">,
        "CRIMINAL",
      ),
    ).toBe(true);
    expect(
      documentMatchesDomain(
        {
          title: "ҮЙЛДВЭРЧНИЙ ЭВЛЭЛҮҮДИЙН ЭРХИЙН ТУХАЙ",
          metadata: { documentType: "LAW" },
        } as Pick<StoredKnowledgeDocument, "title" | "metadata">,
        "CRIMINAL",
      ),
    ).toBe(false);
  });

  it("strips HTML chrome from titles", () => {
    expect(
      stripLegalHtmlTags(
        '<span style="font-family:Arial">LAW</span> OF MONGOLIA',
      ),
    ).toBe("LAW OF MONGOLIA");
  });

  it("does not surface unrelated Article 1 laws for a criminal question", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      lawDoc({
        id: "trade-union",
        title: "ҮЙЛДВЭРЧНИЙ ЭВЛЭЛҮҮДИЙН ЭРХИЙН ТУХАЙ",
        articles: [
          {
            id: "tu-1",
            articleNumber: "1",
            title: "1 дүгээр зүйл",
            text: "Энэ хуулийн зорилго нь үйлдвэрчний эвлэлийн эрхийг хамгаалах.",
            order: 0,
          },
        ],
      }),
    );
    await knowledge.save(
      lawDoc({
        id: "criminal",
        title: "Монгол Улсын Эрүүгийн хууль (шинэчилсэн найруулга)",
        documentType: "CRIMINAL_CODE",
        articles: [
          {
            id: "cr-1",
            articleNumber: "1",
            title: "1 дүгээр зүйл",
            text: "Энэ хуулийн зорилго.",
            order: 0,
          },
          {
            id: "cr-35",
            articleNumber: "35.1",
            title: "35.1 дүгээр зүйл",
            text: "Цагдаагийн байгууллагаас дуудсан тохиолдолд оролцох журам. Хохирогч, гэрчтэй холбогдохыг хориглоно.",
            order: 1,
          },
        ],
      }),
    );

    const question =
      "Намайг цагдаад дуудсан. Хохирогчтой холбогдож болох уу?";
    const docs = await knowledge.list();
    const hits = rankDocumentsToHits(docs, {
      text: question,
      domain: inferLegalDomainFromText(question),
      jurisdiction: "MN",
      officialSourceKinds: "all",
      limit: 8,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.documentId === "criminal")).toBe(true);
    expect(
      hits.every((h) => h.score >= MIN_OPEN_QUESTION_CITATION_SCORE - 0.05),
    ).toBe(true);

    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveLegalQuestion({
      question,
      query: question,
      locator: null,
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities.length).toBeGreaterThan(0);
      expect(result.authorities.every((a) => /эрүүгийн/i.test(a.title))).toBe(
        true,
      );
      expect(result.authorities.some((a) => /үйлдвэрчн/i.test(a.title))).toBe(
        false,
      );
    }
  });
});
