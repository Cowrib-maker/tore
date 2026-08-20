import { randomUUID } from "node:crypto";

import { sha256Hex, storageKeyForHash } from "./hash";
import { mimeTypeForFileName } from "./mime";
import type {
  ArchiveHealth,
  ArchiveRecord,
  ArchiveServiceDependencies,
  ArchiveStoreInput,
  ArchiveStoreResult,
  IArchiveRepository,
  IArchiveStorage,
} from "./types";

/**
 * Immutable archive facade.
 * Deduplicates by SHA-256; new bytes under the same source URL become a new version.
 * Metadata is written only after blob storage verifies the checksum.
 */
export class ArchiveService {
  private readonly repository: IArchiveRepository;
  private readonly storage: IArchiveStorage;

  constructor(dependencies: ArchiveServiceDependencies) {
    this.repository = dependencies.repository;
    this.storage = dependencies.storage;
  }

  async store(input: ArchiveStoreInput): Promise<ArchiveStoreResult> {
    const sha256 = sha256Hex(input.bytes);
    const existing = await this.repository.findByHash(sha256);
    if (existing) {
      return { record: existing, created: false };
    }

    const storageKey = storageKeyForHash(sha256);
    try {
      await this.storage.putIfAbsent(storageKey, input.bytes);
    } catch (error) {
      throw new Error(
        `Archive storage write failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const stored = await this.storage.get(storageKey);
    if (!stored) {
      throw new Error("Archive storage write could not be read back");
    }
    const checksumVerified = sha256Hex(stored) === sha256;
    if (!checksumVerified) {
      throw new Error("Archive checksum verification failed");
    }

    const versions = await this.repository.findVersions(
      input.connectorId,
      input.originalUrl,
    );
    const fetchedAt =
      input.fetchedAt ?? input.downloadedAt ?? new Date().toISOString();

    const record: ArchiveRecord = Object.freeze({
      archiveId: randomUUID(),
      connectorId: input.connectorId,
      source: input.source,
      sourceId: input.sourceId,
      lawId: input.lawId ?? null,
      jurisdiction: input.jurisdiction,
      authority: input.authority,
      sourceType: input.sourceType,
      originalUrl: input.originalUrl,
      fetchedAt,
      sha256,
      checksumVerified: true,
      mimeType: mimeTypeForFileName(input.originalFileName, input.mimeType),
      byteSize: input.bytes.byteLength,
      archiveVersion: (versions.at(-1)?.archiveVersion ?? 0) + 1,
      storageKey,
      originalFileName: input.originalFileName,
      encoding: input.encoding,
    });
    await this.repository.save(record);
    return { record, created: true };
  }

  async findByHash(sha256: string): Promise<ArchiveRecord | null> {
    return this.repository.findByHash(sha256);
  }

  async findByArchiveId(archiveId: string): Promise<ArchiveRecord | null> {
    return this.repository.findByArchiveId(archiveId);
  }

  async findVersions(archiveId: string): Promise<ArchiveRecord[]> {
    const record = await this.repository.findByArchiveId(archiveId);
    if (!record) {
      return [];
    }
    return this.repository.findVersions(record.connectorId, record.originalUrl);
  }

  async exists(sha256: string): Promise<boolean> {
    return this.repository.exists(sha256);
  }

  /**
   * Verify that metadata and blob storage agree on the SHA-256.
   * Used before persisting structured knowledge rows.
   */
  async verifyArchiveIntegrity(sha256: string): Promise<ArchiveRecord> {
    const record = await this.repository.findByHash(sha256);
    if (!record) {
      throw new Error(`missing archive metadata for sha256=${sha256}`);
    }
    const bytes = await this.storage.get(record.storageKey);
    if (!bytes) {
      throw new Error(
        `missing archive blob for storageKey=${record.storageKey}`,
      );
    }
    if (sha256Hex(bytes) !== record.sha256) {
      throw new Error(
        `archive checksum mismatch for storageKey=${record.storageKey}`,
      );
    }
    return record;
  }

  async health(): Promise<ArchiveHealth> {
    return this.storage.health();
  }
}

export function createArchiveService(
  dependencies: ArchiveServiceDependencies,
): ArchiveService {
  return new ArchiveService(dependencies);
}
