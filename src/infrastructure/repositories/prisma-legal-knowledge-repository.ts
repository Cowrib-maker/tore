/**
 * PostgreSQL persistence for structured legal knowledge.
 * Always verifies the linked archive blob before insert.
 *
 * Article search filters in SQL — does not load the full corpus into memory.
 */

import type { ArchiveService } from "@/engine/data/archive";
import {
  domainFilterHints,
  extractArticleNumberFromText,
  isCitableOfficialDocumentType,
  isPositiveLawDocumentType,
  normalizeArticleNumber,
  rankDocumentsToHits,
  tokenizeSearchTerms,
} from "@/engine/knowledge/repository/article-search";
import type {
  IKnowledgeRepository,
  KnowledgeArticle,
  KnowledgeArticleHit,
  KnowledgeArticleSearchQuery,
  KnowledgeChunk,
  KnowledgeDocumentKind,
  StoredKnowledgeDocument,
} from "@/engine/knowledge/types";
import type { PrismaDbClient } from "@/infrastructure/database/prisma-client";

type PrismaWhere = Record<string, unknown>;

const DOCUMENT_INCLUDE = {
  articles: { orderBy: { order: "asc" as const } },
  chunks: { orderBy: { order: "asc" as const } },
  archive: true,
} as const;

export class PrismaKnowledgeRepository implements IKnowledgeRepository {
  constructor(
    private readonly archive: ArchiveService,
    private readonly db: PrismaDbClient,
  ) {}

  async save(document: StoredKnowledgeDocument): Promise<StoredKnowledgeDocument> {
    const provenance = document.provenance;
    if (!provenance?.sha256 || !provenance.archiveId) {
      throw new Error(
        "refusing to persist knowledge without archive provenance",
      );
    }

    const record = await this.archive.verifyArchiveIntegrity(provenance.sha256);
    if (record.archiveId !== provenance.archiveId) {
      throw new Error(
        `archive id mismatch: expected ${provenance.archiveId}, found ${record.archiveId}`,
      );
    }

    const contentSha256 = record.contentSha256;
    const byHash = await this.db.legalKnowledgeDocument.findUnique({
      where: { contentSha256 },
      include: DOCUMENT_INCLUDE,
    });
    if (byHash) {
      // Same canonical legal content, any URL: keep the first ingested row.
      return fromRow(byHash);
    }

    const existing = await this.db.legalKnowledgeDocument.findUnique({
      where: {
        sourceUrl_contentSha256: {
          sourceUrl: document.sourceUrl,
          contentSha256,
        },
      },
      include: DOCUMENT_INCLUDE,
    });
    if (existing) {
      return fromRow(existing);
    }

    const priorVersions = await this.db.legalKnowledgeDocument.count({
      where: { sourceUrl: document.sourceUrl },
    });

    try {
      const created = await this.db.legalKnowledgeDocument.create({
        data: {
          id: document.id,
          sourceId: document.sourceId,
          sourceUrl: document.sourceUrl,
          lawId: provenance.lawId ?? record.lawId,
          title: document.title,
          kind: document.kind,
          language: document.metadata.language,
          jurisdiction: document.metadata.jurisdiction,
          documentType: document.metadata.documentType,
          articleCount: document.articles.length,
          chunkCount: document.chunks.length,
          contentSha256,
          archiveId: record.archiveId,
          version: priorVersions + 1,
          validFrom: document.metadata.validFrom ?? null,
          validTo: document.metadata.validTo ?? null,
          sourceVersion: document.metadata.sourceVersion ?? null,
          ingestedAt: document.ingestedAt,
          articles: {
            create: document.articles.map((article) => ({
              ...(article.id ? { id: article.id } : {}),
              articleNumber: article.articleNumber,
              title: article.title,
              text: article.text,
              order: article.order,
            })),
          },
          chunks: {
            create: document.chunks.map((chunk) => ({
              id: chunk.id,
              articleNumber: chunk.articleNumber,
              order: chunk.order,
              text: chunk.text,
              tokenEstimate: chunk.tokenEstimate,
            })),
          },
        },
        include: DOCUMENT_INCLUDE,
      });

      return fromRow(created);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced =
        (await this.db.legalKnowledgeDocument.findUnique({
          where: { contentSha256 },
          include: DOCUMENT_INCLUDE,
        })) ??
        (await this.db.legalKnowledgeDocument.findUnique({
          where: {
            sourceUrl_contentSha256: {
              sourceUrl: document.sourceUrl,
              contentSha256,
            },
          },
          include: DOCUMENT_INCLUDE,
        }));
      if (raced) {
        return fromRow(raced);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<StoredKnowledgeDocument | null> {
    const row = await this.db.legalKnowledgeDocument.findUnique({
      where: { id },
      include: DOCUMENT_INCLUDE,
    });
    return row ? fromRow(row) : null;
  }

  async findBySourceUrl(
    sourceUrl: string,
  ): Promise<StoredKnowledgeDocument | null> {
    const row = await this.db.legalKnowledgeDocument.findFirst({
      where: { sourceUrl },
      orderBy: { version: "desc" },
      include: DOCUMENT_INCLUDE,
    });
    return row ? fromRow(row) : null;
  }

  async listBySourceUrl(sourceUrl: string): Promise<StoredKnowledgeDocument[]> {
    const rows = await this.db.legalKnowledgeDocument.findMany({
      where: { sourceUrl },
      orderBy: [{ ingestedAt: "asc" }, { id: "asc" }],
      include: DOCUMENT_INCLUDE,
    });
    return rows.map(fromRow);
  }

  async list(): Promise<StoredKnowledgeDocument[]> {
    const rows = await this.db.legalKnowledgeDocument.findMany({
      orderBy: { ingestedAt: "asc" },
      include: DOCUMENT_INCLUDE,
    });
    return rows.map(fromRow);
  }

  /**
   * SQL-scoped article/chunk search. Fetches a bounded candidate set of the
   * smallest useful unit, then ranks with the shared deterministic scorer —
   * never a full-corpus Node scan and never the entire sibling-article HTML.
   */
  async searchArticles(
    query: KnowledgeArticleSearchQuery,
  ): Promise<KnowledgeArticleHit[]> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const candidateLimit = Math.min(limit * 5, 100);
    const documentWhere = buildDocumentWhere(query);
    const wantedArticle =
      normalizeArticleNumber(query.articleNumber) ??
      extractArticleNumberFromText(query.text ?? "");

    const articleRows = await this.db.legalKnowledgeArticle.findMany({
      where: buildArticleWhere(documentWhere, query.text ?? "", wantedArticle),
      take: candidateLimit,
      orderBy: { order: "asc" },
      include: {
        document: {
          include: {
            archive: true,
            chunks: {
              ...(wantedArticle
                ? {
                    where: {
                      OR: [
                        { articleNumber: wantedArticle },
                        {
                          articleNumber: {
                            contains: wantedArticle,
                            mode: "insensitive" as const,
                          },
                        },
                      ],
                    },
                  }
                : {}),
              orderBy: { order: "asc" as const },
              take: 4,
            },
          },
        },
      },
    });

    const chunkRows =
      wantedArticle || !(query.text ?? "").trim()
        ? []
        : await this.db.legalKnowledgeChunk.findMany({
            where: {
              AND: [
                { document: documentWhere },
                buildChunkTextWhere(query.text ?? ""),
              ],
            },
            take: candidateLimit,
            orderBy: { order: "asc" },
            include: {
              document: {
                include: {
                  archive: true,
                  articles: {
                    orderBy: { order: "asc" as const },
                    take: 8,
                  },
                },
              },
            },
          });

    const miniDocs = assembleCandidateDocuments(articleRows, chunkRows, query);
    return rankDocumentsToHits(miniDocs, { ...query, limit });
  }
}

function buildDocumentWhere(query: KnowledgeArticleSearchQuery): PrismaWhere {
  const and: PrismaWhere[] = [];

  if (query.jurisdiction) {
    and.push({ jurisdiction: query.jurisdiction });
  }
  if (query.sourceUrl) {
    and.push({ sourceUrl: query.sourceUrl });
  }
  if (query.sourceId) {
    and.push({ sourceId: query.sourceId });
  }
  if (query.documentType) {
    and.push({ documentType: query.documentType });
  }
  if (query.lawId) {
    and.push({ lawId: query.lawId });
  }
  if (query.titleTerms?.length) {
    and.push({
      OR: query.titleTerms.map((term) => ({
        title: { contains: term, mode: "insensitive" },
      })),
    });
  }
  if (query.excludeTitleTerms?.length) {
    and.push({
      NOT: {
        OR: query.excludeTitleTerms.map((term) => ({
          title: { contains: term, mode: "insensitive" },
        })),
      },
    });
  }

  if (query.officialSourceKinds === "all") {
    and.push({
      NOT: {
        OR: [
          { documentType: { contains: "COMMENTARY", mode: "insensitive" } },
          { documentType: { contains: "DOCTRINE", mode: "insensitive" } },
          { documentType: { contains: "LLM", mode: "insensitive" } },
        ],
      },
    });
  } else {
    and.push({
      NOT: {
        OR: [
          { documentType: { contains: "COURT", mode: "insensitive" } },
          { documentType: { contains: "DECISION", mode: "insensitive" } },
          { documentType: { contains: "JUDGMENT", mode: "insensitive" } },
          { documentType: { contains: "COMMENTARY", mode: "insensitive" } },
          { documentType: { contains: "DOCTRINE", mode: "insensitive" } },
          { documentType: { contains: "REGULATION", mode: "insensitive" } },
          { documentType: { contains: "AI", mode: "insensitive" } },
          { documentType: { contains: "LLM", mode: "insensitive" } },
        ],
      },
    });
  }

  const hints = domainFilterHints(query.domain);
  const or: PrismaWhere[] = [];
  for (const type of hints.documentTypes) {
    or.push({ documentType: type });
  }
  for (const hint of hints.titleTerms) {
    or.push({ title: { contains: hint, mode: "insensitive" } });
    or.push({ documentType: { contains: hint, mode: "insensitive" } });
  }
  if (or.length > 0) {
    and.push({ OR: or });
  }

  if (query.applicableAt) {
    and.push({
      OR: [{ validFrom: null }, { validFrom: { lte: query.applicableAt } }],
    });
    and.push({
      OR: [{ validTo: null }, { validTo: { gte: query.applicableAt } }],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function buildArticleWhere(
  documentWhere: PrismaWhere,
  text: string,
  wantedArticle: string | null,
): PrismaWhere {
  if (wantedArticle) {
    return {
      AND: [
        { document: documentWhere },
        {
          OR: [
            { articleNumber: wantedArticle },
            {
              articleNumber: {
                equals: wantedArticle,
                mode: "insensitive" as const,
              },
            },
            {
              articleNumber: {
                contains: wantedArticle,
                mode: "insensitive" as const,
              },
            },
          ],
        },
      ],
    };
  }

  return {
    AND: [{ document: documentWhere }, buildTextContainsWhere(text)],
  };
}

function buildTextContainsWhere(text: string): PrismaWhere {
  const tokens = tokenizeSearchTerms(text, 6);
  if (tokens.length === 0) {
    return {};
  }
  return {
    OR: tokens.flatMap((token) => [
      { articleNumber: { contains: token, mode: "insensitive" as const } },
      { title: { contains: token, mode: "insensitive" as const } },
      { text: { contains: token, mode: "insensitive" as const } },
    ]),
  };
}

function buildChunkTextWhere(text: string): PrismaWhere {
  const tokens = tokenizeSearchTerms(text, 6);
  if (tokens.length === 0) {
    return {};
  }
  return {
    OR: tokens.flatMap((token) => [
      { articleNumber: { contains: token, mode: "insensitive" as const } },
      { text: { contains: token, mode: "insensitive" as const } },
    ]),
  };
}

type ArticleSearchRow = {
  id: string;
  documentId: string;
  articleNumber: string | null;
  title: string | null;
  text: string;
  order: number;
  document: KnowledgeRow;
};

type ChunkSearchRow = {
  id: string;
  documentId: string;
  articleNumber: string | null;
  order: number;
  text: string;
  tokenEstimate: number;
  document: KnowledgeRow;
};

function assembleCandidateDocuments(
  articleRows: ArticleSearchRow[],
  chunkRows: ChunkSearchRow[],
  query: KnowledgeArticleSearchQuery,
): StoredKnowledgeDocument[] {
  const byId = new Map<string, StoredKnowledgeDocument>();
  const typeOk = (documentType: string | null) =>
    query.officialSourceKinds === "all"
      ? isCitableOfficialDocumentType(documentType)
      : isPositiveLawDocumentType(documentType);

  for (const row of articleRows) {
    if (!typeOk(row.document.documentType)) continue;
    const mini = fromRow({
      ...row.document,
      articles: [
        {
          id: row.id,
          articleNumber: row.articleNumber,
          title: row.title,
          text: row.text,
          order: row.order,
        },
      ],
      chunks: row.document.chunks ?? [],
    });
    mergeMiniDocument(byId, mini);
  }

  for (const row of chunkRows) {
    if (!typeOk(row.document.documentType)) continue;
    const matchingArticles = (row.document.articles ?? []).filter(
      (article) =>
        normalizeArticleNumber(article.articleNumber) ===
        normalizeArticleNumber(row.articleNumber),
    );
    const articles =
      matchingArticles.length > 0
        ? matchingArticles
        : [
            {
              id: row.id,
              articleNumber: row.articleNumber,
              title: null,
              text: row.text,
              order: row.order,
            },
          ];
    const mini = fromRow({
      ...row.document,
      articles,
      chunks: [
        {
          id: row.id,
          documentId: row.documentId,
          articleNumber: row.articleNumber,
          order: row.order,
          text: row.text,
          tokenEstimate: row.tokenEstimate,
        },
      ],
    });
    mergeMiniDocument(byId, mini);
  }

  return [...byId.values()];
}

function mergeMiniDocument(
  byId: Map<string, StoredKnowledgeDocument>,
  incoming: StoredKnowledgeDocument,
): void {
  const existing = byId.get(incoming.id);
  if (!existing) {
    byId.set(incoming.id, incoming);
    return;
  }
  const articles = [...existing.articles];
  for (const article of incoming.articles) {
    if (!articles.some((a) => a.id === article.id)) {
      articles.push(article);
    }
  }
  const chunks = [...existing.chunks];
  for (const chunk of incoming.chunks) {
    if (!chunks.some((c) => c.id === chunk.id)) {
      chunks.push(chunk);
    }
  }
  byId.set(incoming.id, { ...existing, articles, chunks });
}

type KnowledgeRow = {
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
  archive?: {
    sha256: string;
    contentSha256: string;
  } | null;
  version?: number;
  validFrom?: string | null;
  validTo?: string | null;
  sourceVersion?: string | null;
  ingestedAt: Date;
  articles?: Array<{
    id?: string;
    articleNumber: string | null;
    title: string | null;
    text: string;
    order: number;
  }>;
  chunks?: Array<{
    id: string;
    documentId: string;
    articleNumber: string | null;
    order: number;
    text: string;
    tokenEstimate: number;
  }>;
};

function fromRow(row: KnowledgeRow): StoredKnowledgeDocument {
  const articles: KnowledgeArticle[] = (row.articles ?? []).map(
    (article, index) => ({
      id: article.id ?? `${row.id}:article:${article.order ?? index}`,
      articleNumber: article.articleNumber,
      title: article.title,
      text: article.text,
      order: article.order,
    }),
  );
  const chunks: KnowledgeChunk[] = (row.chunks ?? []).map((chunk) => ({
    id: chunk.id,
    documentId: chunk.documentId,
    articleNumber: chunk.articleNumber,
    order: chunk.order,
    text: chunk.text,
    tokenEstimate: chunk.tokenEstimate,
  }));
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceUrl: row.sourceUrl,
    title: row.title,
    kind: row.kind as KnowledgeDocumentKind,
    metadata: {
      title: row.title,
      language: row.language,
      jurisdiction: row.jurisdiction,
      documentType: row.documentType,
      sourceUrl: row.sourceUrl,
      articleCount: row.articleCount,
      validFrom: row.validFrom ?? null,
      validTo: row.validTo ?? null,
      sourceVersion: row.sourceVersion ?? null,
    },
    articles,
    chunks,
    ingestedAt: row.ingestedAt,
    version: row.version,
    provenance: {
      archiveId: row.archiveId,
      sha256: row.archive?.sha256 ?? row.contentSha256,
      contentSha256: row.contentSha256,
      originalUrl: row.sourceUrl,
      lawId: row.lawId,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
