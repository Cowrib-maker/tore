import type { LegalIntelligenceSourceRow } from "@/domain/legal-intelligence";
import type { LegalIntelligenceRepository } from "@/domain/repositories/legal-intelligence-repository";
import { prisma } from "@/infrastructure/database/prisma";

function truncateSourceExcerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 24) return null;
  return cleaned.slice(0, 400);
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
          take: 1,
        },
      },
      orderBy: [{ ingestedAt: "desc" }, { id: "desc" }],
      take,
    });

    return rows.map((row) => {
      const first = row.articles[0];
      const excerptSource = first?.title
        ? `${first.title}. ${first.text}`
        : first?.text;
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
        sourceExcerpt: truncateSourceExcerpt(excerptSource),
      };
    });
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
          take: 1,
        },
      },
      orderBy: [{ ingestedAt: "desc" }, { id: "desc" }],
      take,
    });

    return rows.map((row) => {
      const first = row.articles[0];
      const excerptSource = first?.title
        ? `${first.title}. ${first.text}`
        : first?.text;
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
        sourceExcerpt: truncateSourceExcerpt(excerptSource),
      };
    });
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
          take: 1,
        },
      },
    });
    if (!row) return null;

    const first = row.articles[0];
    const excerptSource = first?.title
      ? `${first.title}. ${first.text}`
      : first?.text;

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
      sourceExcerpt: truncateSourceExcerpt(excerptSource),
    };
  }
}

export const legalIntelligenceRepository =
  new PrismaLegalIntelligenceRepository();
