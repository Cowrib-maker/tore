import type { Prisma } from "@/generated/prisma/client";
import type {
  CreateMatterDocumentInput,
  MatterDocument,
} from "@/domain/entities/matter-document";
import type { LegalAiDocumentExtractStatus } from "@/application/ai/legal-ai-document.constants";
import type { MatterDocumentRepository } from "@/domain/repositories/matter-document-repository";
import { getPrismaClient } from "@/infrastructure/database/prisma-client";

type MatterDocumentRow = Prisma.MatterDocumentGetPayload<Record<string, never>>;

function mapMatterDocument(row: MatterDocumentRow): MatterDocument {
  return {
    id: row.id,
    matterId: row.matterId,
    uploadedByUserId: row.uploadedByUserId,
    storageKey: row.storageKey,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    extractedText: row.extractedText,
    pageCount: row.pageCount,
    extractStatus: row.extractStatus as LegalAiDocumentExtractStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaMatterDocumentRepository implements MatterDocumentRepository {
  async create(input: CreateMatterDocumentInput): Promise<MatterDocument> {
    const db = getPrismaClient();
    const created = await db.matterDocument.create({
      data: {
        matterId: input.matterId,
        uploadedByUserId: input.uploadedByUserId,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractedText: input.extractedText,
        pageCount: input.pageCount,
        extractStatus: input.extractStatus,
      },
    });
    return mapMatterDocument(created);
  }

  async findById(id: string): Promise<MatterDocument | null> {
    const db = getPrismaClient();
    const row = await db.matterDocument.findUnique({ where: { id } });
    return row ? mapMatterDocument(row) : null;
  }

  async listByMatterId(matterId: string): Promise<MatterDocument[]> {
    const db = getPrismaClient();
    const rows = await db.matterDocument.findMany({
      where: { matterId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapMatterDocument);
  }
}

export const matterDocumentRepository = new PrismaMatterDocumentRepository();
