/**
 * PostgreSQL persistence for structured legal knowledge.
 * Always verifies the linked archive blob before insert.
 */

import type { ArchiveService } from "@/engine/data/archive";
import type {
  IKnowledgeRepository,
  KnowledgeArticle,
  KnowledgeChunk,
  KnowledgeDocumentKind,
  StoredKnowledgeDocument,
} from "@/engine/knowledge/types";
import type { PrismaDbClient } from "@/infrastructure/database/prisma-client";

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

    const existing = await this.db.legalKnowledgeDocument.findUnique({
      where: {
        sourceUrl_contentSha256: {
          sourceUrl: document.sourceUrl,
          contentSha256: provenance.sha256,
        },
      },
      include: { articles: { orderBy: { order: "asc" } }, chunks: { orderBy: { order: "asc" } } },
    });
    if (existing) {
      return fromRow(existing);
    }

    const priorVersions = await this.db.legalKnowledgeDocument.count({
      where: { sourceUrl: document.sourceUrl },
    });

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
        contentSha256: provenance.sha256,
        archiveId: record.archiveId,
        version: priorVersions + 1,
        ingestedAt: document.ingestedAt,
        articles: {
          create: document.articles.map((article) => ({
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
      include: {
        articles: { orderBy: { order: "asc" } },
        chunks: { orderBy: { order: "asc" } },
      },
    });

    return fromRow(created);
  }

  async findById(id: string): Promise<StoredKnowledgeDocument | null> {
    const row = await this.db.legalKnowledgeDocument.findUnique({
      where: { id },
      include: {
        articles: { orderBy: { order: "asc" } },
        chunks: { orderBy: { order: "asc" } },
      },
    });
    return row ? fromRow(row) : null;
  }

  async findBySourceUrl(
    sourceUrl: string,
  ): Promise<StoredKnowledgeDocument | null> {
    const row = await this.db.legalKnowledgeDocument.findFirst({
      where: { sourceUrl },
      orderBy: { version: "desc" },
      include: {
        articles: { orderBy: { order: "asc" } },
        chunks: { orderBy: { order: "asc" } },
      },
    });
    return row ? fromRow(row) : null;
  }

  async list(): Promise<StoredKnowledgeDocument[]> {
    const rows = await this.db.legalKnowledgeDocument.findMany({
      orderBy: { ingestedAt: "asc" },
      include: {
        articles: { orderBy: { order: "asc" } },
        chunks: { orderBy: { order: "asc" } },
      },
    });
    return rows.map(fromRow);
  }
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
  ingestedAt: Date;
  articles: Array<{
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

function fromRow(row: KnowledgeRow): StoredKnowledgeDocument {
  const articles: KnowledgeArticle[] = row.articles.map((article) => ({
    articleNumber: article.articleNumber,
    title: article.title,
    text: article.text,
    order: article.order,
  }));
  const chunks: KnowledgeChunk[] = row.chunks.map((chunk) => ({
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
    },
    articles,
    chunks,
    ingestedAt: row.ingestedAt,
    provenance: {
      archiveId: row.archiveId,
      sha256: row.contentSha256,
      originalUrl: row.sourceUrl,
      lawId: row.lawId,
    },
  };
}
