import type { LegalIntelligenceSourceRow } from "@/domain/legal-intelligence";
import type { LegalIntelligenceRepository } from "@/domain/repositories/legal-intelligence-repository";
import { prisma } from "@/infrastructure/database/prisma";

export class PrismaLegalIntelligenceRepository
  implements LegalIntelligenceRepository
{
  async listPublicSummaries(
    limit: number,
  ): Promise<LegalIntelligenceSourceRow[]> {
    const take = Math.min(Math.max(limit, 1), 80);
    const rows = await prisma.legalKnowledgeDocument.findMany({
      select: {
        title: true,
        sourceUrl: true,
        documentType: true,
        validFrom: true,
        version: true,
      },
      orderBy: [{ ingestedAt: "desc" }, { id: "desc" }],
      take,
    });

    return rows.map((row) => ({
      title: row.title,
      sourceUrl: row.sourceUrl,
      documentType: row.documentType,
      validFrom: row.validFrom,
      version: row.version,
    }));
  }
}

export const legalIntelligenceRepository =
  new PrismaLegalIntelligenceRepository();
