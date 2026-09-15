import type {
  CaseTimelineEntry,
  CreateCaseTimelineEntryInput,
} from "@/domain/entities/case-timeline";
import type { CaseTimelineRepository } from "@/domain/repositories/case-timeline-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

function mapRow(row: {
  id: string;
  caseFileId: string;
  caseEvidenceId: string;
  rawDateText: string;
  parsedDate: Date | null;
  eventText: string;
  sourceExcerpt: string;
  confidence: string;
  createdAt: Date;
}): CaseTimelineEntry {
  return {
    id: row.id,
    caseFileId: row.caseFileId,
    caseEvidenceId: row.caseEvidenceId,
    rawDateText: row.rawDateText,
    parsedDate: row.parsedDate,
    eventText: row.eventText,
    sourceExcerpt: row.sourceExcerpt,
    confidence: row.confidence as CaseTimelineEntry["confidence"],
    createdAt: row.createdAt,
  };
}

export class PrismaCaseTimelineRepository implements CaseTimelineRepository {
  constructor(private readonly client?: PrismaDbClient) {}

  async replaceForCaseFile(
    caseFileId: string,
    entries: CreateCaseTimelineEntryInput[],
  ): Promise<CaseTimelineEntry[]> {
    const db = getPrismaClient(this.client);
    const run = async (tx: PrismaDbClient) => {
      await tx.caseTimelineEntry.deleteMany({ where: { caseFileId } });
      if (entries.length === 0) return [];
      await tx.caseTimelineEntry.createMany({
        data: entries.map((entry) => ({
          caseFileId: entry.caseFileId,
          caseEvidenceId: entry.caseEvidenceId,
          rawDateText: entry.rawDateText,
          parsedDate: entry.parsedDate,
          eventText: entry.eventText,
          sourceExcerpt: entry.sourceExcerpt,
          confidence: entry.confidence,
        })),
      });
      return tx.caseTimelineEntry.findMany({
        where: { caseFileId },
        orderBy: [{ parsedDate: "asc" }, { createdAt: "asc" }],
      });
    };
    const supportsTransaction = typeof (db as { $transaction?: unknown }).$transaction === "function";
    const rows = supportsTransaction
      ? await (db as { $transaction: <T>(fn: (tx: PrismaDbClient) => Promise<T>) => Promise<T> }).$transaction(run)
      : await run(db);
    return rows.map(mapRow);
  }

  async listByCaseFileId(caseFileId: string): Promise<CaseTimelineEntry[]> {
    const db = getPrismaClient(this.client);
    const rows = await db.caseTimelineEntry.findMany({
      where: { caseFileId },
      orderBy: [{ parsedDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapRow);
  }
}

export const caseTimelineRepository = new PrismaCaseTimelineRepository();
