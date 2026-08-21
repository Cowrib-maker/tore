import type { ArchiveRecord, IArchiveRepository } from "./types";

function cloneRecord(record: ArchiveRecord): ArchiveRecord {
  return Object.freeze({ ...record });
}

/**
 * Process-local metadata store. Records are insert-only.
 */
export class InMemoryArchiveRepository implements IArchiveRepository {
  private readonly byId = new Map<string, ArchiveRecord>();
  private readonly byHash = new Map<string, string>();

  async save(record: ArchiveRecord): Promise<void> {
    if (this.byId.has(record.archiveId)) {
      throw new Error(`Archive record is immutable: ${record.archiveId}`);
    }
    if (this.byHash.has(record.sha256)) {
      throw new Error(`Archive hash already exists: ${record.sha256}`);
    }
    const frozen = cloneRecord(record);
    this.byId.set(frozen.archiveId, frozen);
    this.byHash.set(frozen.sha256, frozen.archiveId);
  }

  async findByHash(sha256: string): Promise<ArchiveRecord | null> {
    const id = this.byHash.get(sha256.toLowerCase());
    if (!id) {
      return null;
    }
    return this.byId.get(id) ?? null;
  }

  async findByArchiveId(archiveId: string): Promise<ArchiveRecord | null> {
    return this.byId.get(archiveId) ?? null;
  }

  async findVersions(
    connectorId: string,
    originalUrl: string,
  ): Promise<ArchiveRecord[]> {
    return [...this.byId.values()]
      .filter(
        (record) =>
          record.connectorId === connectorId &&
          record.originalUrl === originalUrl,
      )
      .sort((left, right) => left.archiveVersion - right.archiveVersion);
  }

  async exists(sha256: string): Promise<boolean> {
    return this.byHash.has(sha256.toLowerCase());
  }
}
