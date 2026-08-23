import { describe, expect, it, vi } from "vitest";

import { FallbackLegalCorpusRetriever } from "@/application/ai/fallback-legal-corpus-retriever";
import {
  CitationVerificationStatus,
  type LegalCorpusAuthority,
  type LegalCorpusRetriever,
  type LegalCorpusRetrieveInput,
  type LegalCorpusRetrieveResult,
} from "@/application/ai/legal-corpus";
import { KnowledgeDocumentKind, LegalTemporalRelationType } from "@/engine/knowledge";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge/repository";
import type { StoredKnowledgeDocument } from "@/engine/knowledge/types";
import { KnowledgeLegalCorpusRetriever } from "@/infrastructure/ai/knowledge-legal-corpus-retriever";

const GOLDEN_QUERY = "Эрүүгийн хуулийн 17.1 дүгээр зүйл";
const GOLDEN_EXCERPT = "Гэмт хэрэг гэж хуулиар хориглосон үйлдэл.";

function goldenDocument(
  overrides: {
    articleNumber?: string;
    provenance?: StoredKnowledgeDocument["provenance"] | false;
    id?: string;
    articleId?: string;
    sourceUrl?: string;
  } = {},
): StoredKnowledgeDocument {
  const id = overrides.id ?? "doc-criminal-17-1";
  const provenance =
    overrides.provenance === false
      ? undefined
      : (overrides.provenance ?? {
          archiveId: "arch-criminal-17-1",
          sha256: "sha256-criminal-17-1",
          originalUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
        });
  return {
    id,
    sourceId: "legalinfo",
    sourceUrl:
      overrides.sourceUrl ??
      "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
    title: "Монгол Улсын Эрүүгийн хууль",
    kind: KnowledgeDocumentKind.HTML,
    metadata: {
      title: "Монгол Улсын Эрүүгийн хууль",
      language: "mn",
      jurisdiction: "MN",
      documentType: "CRIMINAL_CODE",
      sourceUrl:
        overrides.sourceUrl ??
        "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
      articleCount: 1,
      validFrom: null,
      validTo: null,
      sourceVersion: null,
    },
    articles: [
      {
        id: overrides.articleId ?? "art-17-1",
        articleNumber: overrides.articleNumber ?? "17.1",
        title: "17.1 дүгээр зүйл",
        text: GOLDEN_EXCERPT,
        order: 0,
      },
    ],
    chunks: [],
    ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
    provenance,
  };
}

function engineAuthority(): LegalCorpusAuthority {
  return {
    nodeId: "engine-node-1",
    documentId: "engine-doc-1",
    documentVersionId: "engine-ver-1",
    locator: "art-17/p-1",
    title: "Эрүүгийн хууль",
    excerpt: GOLDEN_EXCERPT,
    contentHash: "hash-node",
    sourceContentHash: "hash-source",
    parserId: "legalinfo-html-v1",
    archiveRecordId: "arch-engine",
    effectiveFrom: null,
    effectiveTo: null,
  };
}

function createRemote(
  retrieve: LegalCorpusRetriever["retrieveExactCitation"] = async () => ({
    kind: "unavailable",
    reason: "not_configured",
    authorities: [],
    retrievedAt: null,
  }),
  verify: LegalCorpusRetriever["verifyCitation"] = async () => ({
    ok: false,
    reason: "not_configured",
  }),
): LegalCorpusRetriever & {
  retrieveExactCitation: ReturnType<typeof vi.fn>;
  retrieveLegalQuestion: ReturnType<typeof vi.fn>;
  verifyCitation: ReturnType<typeof vi.fn>;
} {
  return {
  retrieveExactCitation: vi.fn(retrieve),
  retrieveLegalQuestion: vi.fn(
    async (
      _input: LegalCorpusRetrieveInput,
    ): Promise<LegalCorpusRetrieveResult> => ({
      kind: "unavailable",
      reason: "not_configured",
      authorities: [],
      retrievedAt: null,
    }),
  ),
  verifyCitation: vi.fn(verify),
};
}

describe("KnowledgeLegalCorpusRetriever", () => {
  it("retrieves the golden Criminal Code 17.1 article from structured local data", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument());
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);

    const result = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });

    expect(result.kind).toBe("retrieved");
    if (result.kind !== "retrieved") {
      return;
    }
    expect(result.authorities).toHaveLength(1);
    expect(result.authorities[0]?.title).toBe("Монгол Улсын Эрүүгийн хууль");
    expect(result.authorities[0]?.excerpt).toBe(GOLDEN_EXCERPT);
    expect(result.authorities[0]?.article).toBe("17.1");
    expect(result.authorities[0]?.paragraph).toBe("1");
    expect(result.authorities[0]?.sourceType).toBe("legal-knowledge");
    expect(result.authorities[0]?.sourceUrl).toBe(
      "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
    );
    expect(result.authorities[0]?.effectiveFrom).toBeNull();
    expect(result.authorities[0]?.effectiveTo).toBeNull();
    expect(result.authorities[0]?.sourceVersion).toBeNull();
  });

  it("verifies a unique provenance-backed local hit as VALID", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument());
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);

    const retrieved = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(retrieved.kind).toBe("retrieved");
    const nodeId =
      retrieved.kind === "retrieved" ? retrieved.authorities[0]?.nodeId : null;

    const verified = await retriever.verifyCitation({
      query: GOLDEN_QUERY,
      nodeId,
      documentId: "doc-criminal-17-1",
      locator: "art-17/p-1",
    });
    expect(verified).toMatchObject({
      ok: true,
      verdict: {
        status: CitationVerificationStatus.VALID,
        nodeId,
        reasons: expect.arrayContaining(["citation_unique", "local_provenance"]),
      },
    });
  });

  it("does not treat an unverified local hit as retrieved authority", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument({ provenance: false }));
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);

    const result = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(result).toEqual({
      kind: "unavailable",
      reason: "not_found",
      authorities: [],
      retrievedAt: null,
    });
  });

  it("returns CONFLICT when two provenance-backed articles match the same citation", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument());
    await knowledge.save(
      goldenDocument({
        id: "doc-criminal-17-1-b",
        articleId: "art-17-1-b",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-criminal-b",
        provenance: {
          archiveId: "arch-b",
          sha256: "sha-b",
          originalUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-criminal-b",
        },
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);

    const retrieved = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(retrieved.kind).toBe("retrieved");
    if (retrieved.kind === "retrieved") {
      expect(retrieved.authorities.length).toBeGreaterThan(1);
    }

    const verified = await retriever.verifyCitation({ query: GOLDEN_QUERY });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.verdict.status).toBe(CitationVerificationStatus.CONFLICT);
    }
  });

  it("does not invent a missing provision", async () => {
    const retriever = new KnowledgeLegalCorpusRetriever(
      new InMemoryKnowledgeRepository(),
    );
    await expect(
      retriever.retrieveExactCitation({
        question: GOLDEN_QUERY,
        query: GOLDEN_QUERY,
        locator: "art-17/p-1",
      }),
    ).resolves.toMatchObject({ kind: "unavailable", reason: "not_found" });
  });

  it("does not use embeddings or a vector index", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(
        process.cwd(),
        "src/infrastructure/ai/knowledge-legal-corpus-retriever.ts",
      ),
      "utf8",
    );
    const composition = readFileSync(
      join(process.cwd(), "src/application/ai/create-legal-ai-service.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /openai\.embeddings|text-embedding|pinecone|chroma|vectorStore|vector store|createEmbedding/i,
    );
    expect(source).toContain("No embeddings");
    expect(source).toContain("searchArticles");
    expect(composition).toContain("KnowledgeLegalCorpusRetriever");
    expect(composition).toContain("FallbackLegalCorpusRetriever");
    expect(composition).toContain("HttpLegalCorpusRetriever");
    expect(composition).not.toMatch(/embed|vector|pinecone|chroma/i);
  });
});

describe("FallbackLegalCorpusRetriever", () => {
  it("uses local structured retrieval when the golden provision is verified locally", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument());
    const remote = createRemote();
    const retriever = new FallbackLegalCorpusRetriever(
      new KnowledgeLegalCorpusRetriever(knowledge),
      remote,
    );

    const retrieved = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(retrieved.kind).toBe("retrieved");
    expect(remote.retrieveExactCitation).not.toHaveBeenCalled();

    const verified = await retriever.verifyCitation({
      query: GOLDEN_QUERY,
      nodeId:
        retrieved.kind === "retrieved"
          ? retrieved.authorities[0]?.nodeId
          : null,
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.verdict.status).toBe(CitationVerificationStatus.VALID);
    }
    expect(remote.verifyCitation).not.toHaveBeenCalled();
  });

  it("falls back to the external engine when local corpus has no match", async () => {
    const remote = createRemote(
      async () => ({
        kind: "retrieved",
        status: "ok",
        authorities: [engineAuthority()],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      }),
      async () => ({
        ok: true,
        verdict: {
          query: GOLDEN_QUERY,
          status: CitationVerificationStatus.VALID,
          nodeId: "engine-node-1",
          documentVersionId: "engine-ver-1",
          locator: "art-17/p-1",
          reasons: ["citation_unique"],
        },
      }),
    );
    const retriever = new FallbackLegalCorpusRetriever(
      new KnowledgeLegalCorpusRetriever(new InMemoryKnowledgeRepository()),
      remote,
    );

    const retrieved = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(retrieved.kind).toBe("retrieved");
    if (retrieved.kind === "retrieved") {
      expect(retrieved.authorities[0]?.nodeId).toBe("engine-node-1");
    }
    expect(remote.retrieveExactCitation).toHaveBeenCalledOnce();

    const verified = await retriever.verifyCitation({
      query: GOLDEN_QUERY,
      nodeId: "engine-node-1",
    });
    expect(verified).toMatchObject({
      ok: true,
      verdict: { nodeId: "engine-node-1", status: "VALID" },
    });
    expect(remote.verifyCitation).toHaveBeenCalledOnce();
  });

  it("preserves the safe engine-unavailable result when local and remote are empty", async () => {
    const remote = createRemote();
    const retriever = new FallbackLegalCorpusRetriever(
      new KnowledgeLegalCorpusRetriever(new InMemoryKnowledgeRepository()),
      remote,
    );

    await expect(
      retriever.retrieveExactCitation({
        question: GOLDEN_QUERY,
        query: GOLDEN_QUERY,
        locator: "art-17/p-1",
      }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "not_configured",
      authorities: [],
      retrievedAt: null,
    });
  });

  it("does not convert an unverified local hit into engine-skipped VALID law", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument({ provenance: false }));
    const remote = createRemote();
    const retriever = new FallbackLegalCorpusRetriever(
      new KnowledgeLegalCorpusRetriever(knowledge),
      remote,
    );

    const retrieved = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(retrieved.kind).toBe("unavailable");
    expect(remote.retrieveExactCitation).toHaveBeenCalledOnce();
  });

  it("does not fall back to a remote current scrape when historical applicability is unknown", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument());
    const remote = createRemote(
      async () => ({
        kind: "retrieved",
        status: "ok",
        authorities: [engineAuthority()],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      }),
    );
    const retriever = new FallbackLegalCorpusRetriever(
      new KnowledgeLegalCorpusRetriever(knowledge),
      remote,
    );
    const result = await retriever.retrieveExactCitation({
      question: "2021 оны 5 сарын 10-нд Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(result.kind).toBe("as_of_unavailable");
    expect(remote.retrieveExactCitation).not.toHaveBeenCalled();
  });

  it("does not verify remotely when local temporal applicability is unknown", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument());
    const remote = createRemote();
    const retriever = new FallbackLegalCorpusRetriever(
      new KnowledgeLegalCorpusRetriever(knowledge),
      remote,
    );
    const result = await retriever.verifyCitation({
      question: "2021 оны 5 сарын 10-нд Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      query: GOLDEN_QUERY,
    });
    expect(result).toMatchObject({
      ok: true,
      verdict: { status: CitationVerificationStatus.UNRESOLVED },
    });
    if (result.ok) {
      expect(result.verdict.reasons).toContain("temporal_applicability_unknown");
    }
    expect(remote.verifyCitation).not.toHaveBeenCalled();
  });
});

function civilDocument(
  overrides: {
    id: string;
    articleId: string;
    excerpt: string;
    validFrom: string | null;
    validTo: string | null;
    sourceStatus?: "IN_FORCE" | null;
    articleNumber?: string;
    lawId?: string;
    title?: string;
  },
): StoredKnowledgeDocument {
  const sourceUrl = `https://legalinfo.mn/mn/detail?lawId=${overrides.lawId ?? "299"}`;
  const title = overrides.title ?? "Иргэний хууль";
  return {
    id: overrides.id,
    sourceId: "legalinfo",
    sourceUrl,
    title,
    kind: KnowledgeDocumentKind.HTML,
    metadata: {
      title,
      language: "mn",
      jurisdiction: "MN",
      documentType: "LAW",
      sourceUrl,
      articleCount: 1,
      validFrom: overrides.validFrom,
      validTo: overrides.validTo,
      sourceVersion: null,
      sourceStatus: overrides.sourceStatus ?? null,
    },
    articles: [
      {
        id: overrides.articleId,
        articleNumber: overrides.articleNumber ?? "1",
        title: "1 дүгээр зүйл",
        text: overrides.excerpt,
        order: 0,
      },
    ],
    chunks: [],
    ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
    provenance: {
      archiveId: `arch-${overrides.id}`,
      sha256: `sha-${overrides.id}`,
      contentSha256: `content-${overrides.id}`,
      originalUrl: sourceUrl,
      lawId: overrides.lawId ?? "299",
    },
  };
}

describe("historical and current Legal AI grounding", () => {
  const CIVIL_QUERY = "Иргэний хуулийн 1 дүгээр зүйл";
  const OLD_TEXT = "Хуучин эх: 2015 оны найруулга.";
  const NEW_TEXT = "Шинэ эх: 2021 оны найруулга.";

  it("I. historical query selects the version whose interval covers the date", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "civil-old",
        articleId: "civil-old-1",
        excerpt: OLD_TEXT,
        validFrom: "2010-01-01",
        validTo: "2020-12-31",
      }),
    );
    await knowledge.save(
      civilDocument({
        id: "civil-new",
        articleId: "civil-new-1",
        excerpt: NEW_TEXT,
        validFrom: "2021-01-01",
        validTo: "2025-12-31",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2015 оны 6 сарын 1-нд Иргэний хуулийн 1 дүгээр зүйл",
      query: CIVIL_QUERY,
      locator: "art-1",
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities).toHaveLength(1);
      expect(result.authorities[0]?.excerpt).toBe(OLD_TEXT);
      expect(result.authorities[0]?.excerpt).not.toBe(NEW_TEXT);
    }
  });

  it("J. historical query does not return the latest version when applicability is unknown", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "civil-undated",
        articleId: "civil-undated-1",
        excerpt: NEW_TEXT,
        validFrom: null,
        validTo: null,
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2021 оны 5 сарын 10-нд Иргэний хуулийн 1 дүгээр зүйл",
      query: CIVIL_QUERY,
      locator: "art-1",
    });
    expect(result.kind).toBe("as_of_unavailable");
  });

  it("year-level query does not invent a day and requires the whole year to be proven", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "civil-partial-year",
        articleId: "civil-partial-year-1",
        excerpt: NEW_TEXT,
        validFrom: "2021-06-01",
        validTo: "2021-12-31",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2021 онд Иргэний хуулийн 1 дүгээр зүйл",
      query: CIVIL_QUERY,
      locator: "art-1",
    });
    expect(result.kind).toBe("as_of_unavailable");
  });

  it("K. current query does not treat the latest scrape as proof of current force", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "civil-latest",
        articleId: "civil-latest-1",
        excerpt: NEW_TEXT,
        validFrom: null,
        validTo: null,
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge, {
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });
    const result = await retriever.retrieveExactCitation({
      question: "Одоо Иргэний хуулийн 1 дүгээр зүйл юу гэж заасан бэ?",
      query: CIVIL_QUERY,
      locator: "art-1",
    });
    expect(result.kind).toBe("as_of_unavailable");
  });

  it("L. null validFrom/validTo is not silently applicable for historical grounding", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(goldenDocument());
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2021 онд Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(result.kind).toBe("as_of_unavailable");
  });

  it("M. explicit REPEALS covering asOf excludes that version", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "civil-repealed",
        articleId: "civil-repealed-1",
        excerpt: OLD_TEXT,
        validFrom: "2010-01-01",
        validTo: "2025-12-31",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2018 оны 1 сарын 1-нд Иргэний хуулийн 1 дүгээр зүйл",
      query: CIVIL_QUERY,
      locator: "art-1",
      explicitRelations: [
        {
          relationType: LegalTemporalRelationType.REPEALS,
          fromLawId: "repeal-act",
          toLawId: "299",
          effectiveDate: "2017-07-01",
          sourceLawId: "repeal-act",
          evidence: "caller-supplied",
        },
      ],
    });
    expect(result.kind).toBe("as_of_unavailable");
  });

  it("N. explicit SUPERSEDES covering asOf excludes the target version", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "company-old",
        articleId: "company-old-1",
        excerpt: OLD_TEXT,
        validFrom: "2008-01-01",
        validTo: "2025-12-31",
        lawId: "310",
        title: "Компанийн тухай хууль",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2018 оны 1 сарын 1-нд Компанийн хуулийн 1 дүгээр зүйл",
      query: "Компанийн хуулийн 1 дүгээр зүйл",
      locator: "art-1",
      explicitRelations: [
        {
          relationType: LegalTemporalRelationType.SUPERSEDES,
          fromLawId: "310-new",
          toLawId: "310",
          effectiveDate: "2016-01-01",
          sourceLawId: "310-new",
          evidence: "caller-supplied",
        },
      ],
    });
    expect(result.kind).toBe("as_of_unavailable");
  });

  it("O. AMENDS does not invent repeal", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "civil-amended",
        articleId: "civil-amended-1",
        excerpt: OLD_TEXT,
        validFrom: "2010-01-01",
        validTo: "2020-12-31",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2015 оны 6 сарын 1-нд Иргэний хуулийн 1 дүгээр зүйл",
      query: CIVIL_QUERY,
      locator: "art-1",
      explicitRelations: [
        {
          relationType: LegalTemporalRelationType.AMENDS,
          fromLawId: "amendment-1",
          toLawId: "299",
          effectiveDate: "2012-01-01",
          sourceLawId: "amendment-1",
          evidence: "amendment is not repeal",
        },
      ],
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities[0]?.excerpt).toBe(OLD_TEXT);
    }
  });

  it("P. similar titles do not create relations", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "building",
        articleId: "building-1",
        excerpt: OLD_TEXT,
        validFrom: null,
        validTo: null,
        lawId: "112",
        title: "Барилгын тухай",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2017 оны 1 сарын 1-нд Барилгын хуулийн 1 дүгээр зүйл",
      query: "Барилгын хуулийн 1 дүгээр зүйл",
      locator: "art-1",
    });
    expect(result.kind).toBe("as_of_unavailable");
  });

  it("Q. 17 and 17.1 remain distinct locators", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    const sourceUrl = "https://legalinfo.mn/mn/detail?lawId=fixture-criminal";
    await knowledge.save({
      ...goldenDocument(),
      articles: [
        {
          id: "art-17",
          articleNumber: "17",
          title: "17 дугаар зүйл",
          text: "Integer article 17",
          order: 0,
        },
        {
          id: "art-17-1",
          articleNumber: "17.1",
          title: "17.1 дүгээр зүйл",
          text: GOLDEN_EXCERPT,
          order: 1,
        },
      ],
      sourceUrl,
    });
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const dotted = await retriever.retrieveExactCitation({
      question: GOLDEN_QUERY,
      query: GOLDEN_QUERY,
      locator: "art-17/p-1",
    });
    expect(dotted.kind).toBe("retrieved");
    if (dotted.kind === "retrieved") {
      expect(dotted.authorities[0]?.article).toBe("17.1");
      expect(dotted.authorities[0]?.excerpt).toBe(GOLDEN_EXCERPT);
    }
  });

  it("R. provenance is required for historical and unspecified grounding", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save({
      ...civilDocument({
        id: "civil-no-prov",
        articleId: "civil-no-prov-1",
        excerpt: OLD_TEXT,
        validFrom: "2010-01-01",
        validTo: "2020-12-31",
      }),
      provenance: undefined,
    });
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    await expect(
      retriever.retrieveExactCitation({
        question: "2015 оны 6 сарын 1-нд Иргэний хуулийн 1 дүгээр зүйл",
        query: CIVIL_QUERY,
        locator: "art-1",
      }),
    ).resolves.toMatchObject({ kind: "unavailable", reason: "not_found" });
  });

  it("S. retriever source has no 11634 special case", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const retriever = readFileSync(
      join(process.cwd(), "src/infrastructure/ai/knowledge-legal-corpus-retriever.ts"),
      "utf8",
    );
    const resolver = readFileSync(
      join(
        process.cwd(),
        "src/engine/knowledge/temporal/resolve-legal-temporal-status.ts",
      ),
      "utf8",
    );
    expect(retriever).not.toContain("11634");
    expect(resolver).not.toContain("11634");
  });

  it("T. the same architecture works for a non-criminal instrument", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "labor-1",
        articleId: "labor-art-1",
        excerpt: "Хөдөлмөрийн гэрээ.",
        validFrom: "2017-01-01",
        validTo: "2022-12-31",
        lawId: "565-successor",
        title: "Хөдөлмөрийн тухай хууль",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge);
    const result = await retriever.retrieveExactCitation({
      question: "2018 оны 3 сарын 1-нд Хөдөлмөрийн хуулийн 1 дүгээр зүйл",
      query: "Хөдөлмөрийн хуулийн 1 дүгээр зүйл",
      locator: "art-1",
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities[0]?.excerpt).toBe("Хөдөлмөрийн гэрээ.");
      expect(result.authorities[0]?.archiveRecordId).toBe("arch-labor-1");
    }
  });

  it("returns a currently forced version only with explicit sourceStatus", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save(
      civilDocument({
        id: "civil-current",
        articleId: "civil-current-1",
        excerpt: NEW_TEXT,
        validFrom: "2021-01-01",
        validTo: null,
        sourceStatus: "IN_FORCE",
      }),
    );
    const retriever = new KnowledgeLegalCorpusRetriever(knowledge, {
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });
    const result = await retriever.retrieveExactCitation({
      question: "Одоогийн Иргэний хуулийн 1 дүгээр зүйл",
      query: CIVIL_QUERY,
      locator: "art-1",
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities[0]?.excerpt).toBe(NEW_TEXT);
    }
  });
});

