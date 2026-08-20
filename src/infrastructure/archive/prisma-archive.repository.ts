/**
 * PostgreSQL-backed insert-only archive metadata.
 */

import type { PrismaDbClient } from "@/infrastructure/database/prisma-client";
import type {
  ArchiveRecord,
  IArchiveRepository,
} from "@/engine/data/archive";

export class PrismaArchiveRepository implements IArchiveRepository {
  constructor(private readonly db: PrismaDbClient) {}

  async save(record: ArchiveRecord): Promise<void> {
    try {
      await this.db.legalSourceArchive.create({
        data: toRow(record),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(`Archive hash already exists: ${record.sha256}`);
      }
      throw error;
    }
  }

  async findByHash(sha256: string): Promise<ArchiveRecord | null> {
    const row = await this.db.legalSourceArchive.findUnique({
      where: { sha256: sha256.toLowerCase() },
    });
    return row ? fromRow(row) : null;
  }

  async findByArchiveId(archiveId: string): Promise<ArchiveRecord | null> {
    const row = await this.db.legalSourceArchive.findUnique({
      where: { id: archiveId },
    });
    return row ? fromRow(row) : null;
  }

  async findVersions(
    connectorId: string,
    originalUrl: string,
  ): Promise<ArchiveRecord[]> {
    const rows = await this.db.legalSourceArchive.findMany({
      where: { connectorId, originalUrl },
      orderBy: { archiveVersion: "asc" },
    });
    return rows.map(fromRow);
  }

  async exists(sha256: string): Promise<boolean> {
    const row = await this.db.legalSourceArchive.findUnique({
      where: { sha256: sha256.toLowerCase() },
      select: { id: true },
    });
    return row != null;
  }
}

type ArchiveRow = {
  id: string;
  connectorId: string;
  source: string;
  sourceId: string;
  lawId: string | null;
  jurisdiction: string;
  authority: string;
  sourceType: string;
  originalUrl: string;
  fetchedAt: Date;
  sha256: string;
  checksumVerified: boolean;
  mimeType: string;
  byteSize: number;
  archiveVersion: number;
  storageKey: string;
  originalFileName: string;
  encoding: string | null;
};

function toRow(record: ArchiveRecord) {
  return {
    id: record.archiveId,
    connectorId: record.connectorId,
    source: record.source,
    sourceId: record.sourceId,
    lawId: record.lawId,
    jurisdiction: record.jurisdiction,
    authority: record.authority,
    sourceType: record.sourceType,
    originalUrl: record.originalUrl,
    fetchedAt: new Date(record.fetchedAt),
    sha256: record.sha256.toLowerCase(),
    checksumVerified: record.checksumVerified,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    archiveVersion: record.archiveVersion,
    storageKey: record.storageKey,
    originalFileName: record.originalFileName,
    encoding: record.encoding ?? null,
  };
}

function fromRow(row: ArchiveRow): ArchiveRecord {
  return Object.freeze({
    archiveId: row.id,
    connectorId: row.connectorId,
    source: row.source,
    sourceId: row.sourceId,
    lawId: row.lawId,
    jurisdiction: row.jurisdiction,
    authority: row.authority,
    sourceType: row.sourceType,
    originalUrl: row.originalUrl,
    fetchedAt: row.fetchedAt.toISOString(),
    sha256: row.sha256,
    checksumVerified: row.checksumVerified,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    archiveVersion: row.archiveVersion,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName,
    encoding: row.encoding ?? undefined,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
