import type { LegalIntelligenceSourceRow } from "@/domain/legal-intelligence";
import type { LegalIntelligenceRepository } from "@/domain/repositories/legal-intelligence-repository";
import { prisma } from "@/infrastructure/database/prisma";

const MIN_EXCERPT_LENGTH = 24;

function truncateSourceExcerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < MIN_EXCERPT_LENGTH) return null;
  return cleaned.slice(0, 400);
}

type ExcerptArticle = { text: string; title: string | null };
type ExcerptChunk = { text: string };

/**
 * Detail pages were often opening to an empty "no excerpt" state: the old
 * logic used only the very first linked article, which is frequently a
 * short heading/title article with too little text to pass the length
 * check. Walk a few candidate articles for the first one with real content,
 * then fall back to the first knowledge chunk (some ingested documents have
 * chunks but no article-level split) before giving up.
 */
function deriveSourceExcerpt(
  articles: ExcerptArticle[],
  chunks: ExcerptChunk[],
): string | null {
  for (const article of articles) {
    const candidate = article.title
      ? `${article.title}. ${article.text}`
      : article.text;
    const truncated = truncateSourceExcerpt(candidate);
    if (truncated) return truncated;
  }
  for (const chunk of chunks) {
    const truncated = truncateSourceExcerpt(chunk.text);
    if (truncated) return truncated;
  }
  return null;
}

export class PrismaLegalIntelligenceRepository
  implements LegalIntelligenceRepository
{
  async listPublicSummaries(
    limit: number,
  ): Promise<LegalIntelligenceSourceRow[]> {
    const take = Math.min(Math.max(limit, 1), 80);
    const rows = await prisma.legalKnowledgeDocument.findMany({
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        documentType: true,
        validFrom: true,
        validTo: true,
        version: true,
        sourceId: true,
        lawId: true,
        articles: {
          select: { text: true, title: true },
          orderBy: { order: "asc" },
          take: 5,
        },
        chunks: {
          select: { text: true },
          orderBy: { order: "asc" },
          take: 1,
        },
      },
      orderBy: [{ ingestedAt: "desc" }, { id: "desc" }],
      take,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceUrl: row.sourceUrl,
      documentType: row.documentType,
      validFrom: row.validFrom,
      validTo: row.validTo,
      version: row.version,
      sourceId: row.sourceId,
      lawId: row.lawId,
      sourceExcerpt: deriveSourceExcerpt(row.articles, row.chunks),
    }));
  }

  async listPublicSummariesByHost(
    host: string,
    limit: number,
  ): Promise<LegalIntelligenceSourceRow[]> {
    const take = Math.min(Math.max(limit, 1), 80);
    const needle = host.trim().toLowerCase();
    if (!needle) return [];
    const rows = await prisma.legalKnowledgeDocument.findMany({
      where: { sourceUrl: { contains: needle, mode: "insensitive" } },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        documentType: true,
        validFrom: true,
        validTo: true,
        version: true,
        sourceId: true,
        lawId: true,
        articles: {
          select: { text: true, title: true },
          orderBy: { order: "asc" },
          take: 5,
        },
        chunks: {
          select: { text: true },
          orderBy: { order: "asc" },
          take: 1,
        },
      },
      orderBy: [{ ingestedAt: "desc" }, { id: "desc" }],
      take,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceUrl: row.sourceUrl,
      documentType: row.documentType,
      validFrom: row.validFrom,
      validTo: row.validTo,
      version: row.version,
      sourceId: row.sourceId,
      lawId: row.lawId,
      sourceExcerpt: deriveSourceExcerpt(row.articles, row.chunks),
    }));
  }

  async findById(id: string): Promise<LegalIntelligenceSourceRow | null> {
    const row = await prisma.legalKnowledgeDocument.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        documentType: true,
        validFrom: true,
        validTo: true,
        version: true,
        sourceId: true,
        lawId: true,
        articles: {
          select: { text: true, title: true },
          orderBy: { order: "asc" },
          take: 5,
        },
        chunks: {
          select: { text: true },
          orderBy: { order: "asc" },
          take: 1,
        },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      sourceUrl: row.sourceUrl,
      documentType: row.documentType,
      validFrom: row.validFrom,
      validTo: row.validTo,
      version: row.version,
      sourceId: row.sourceId,
      lawId: row.lawId,
      sourceExcerpt: deriveSourceExcerpt(row.articles, row.chunks),
    };
  }
}

export const legalIntelligenceRepository =
  new PrismaLegalIntelligenceRepository();
