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
    const existing = this.repository.findByHash(sha256);
    if (existing) {
      return { record: existing, created: false };
    }

    const storageKey = storageKeyForHash(sha256);
    await this.storage.putIfAbsent(storageKey, input.bytes);
    const stored = await this.storage.get(storageKey);
    if (!stored) {
      throw new Error("Archive storage write could not be read back");
    }
    const checksumVerified = sha256Hex(stored) === sha256;
    if (!checksumVerified) {
      throw new Error("Archive checksum verification failed");
    }

    const versions = this.repository.findVersions(
      input.connectorId,
      input.originalUrl,
    );
    const record: ArchiveRecord = Object.freeze({
      archiveId: randomUUID(),
      connectorId: input.connectorId,
      jurisdiction: input.jurisdiction,
      authority: input.authority,
      sourceType: input.sourceType,
      originalUrl: input.originalUrl,
      downloadedAt: input.downloadedAt ?? new Date().toISOString(),
      sha256,
      checksumVerified: true,
      mimeType: mimeTypeForFileName(input.originalFileName, input.mimeType),
      fileSize: input.bytes.byteLength,
      archiveVersion: (versions.at(-1)?.archiveVersion ?? 0) + 1,
      storageKey,
      originalFileName: input.originalFileName,
      encoding: input.encoding,
    });
    this.repository.save(record);
    return { record, created: true };
  }

  findByHash(sha256: string): ArchiveRecord | null {
    return this.repository.findByHash(sha256);
  }

  findByArchiveId(archiveId: string): ArchiveRecord | null {
    return this.repository.findByArchiveId(archiveId);
  }

  findVersions(archiveId: string): ArchiveRecord[] {
    const record = this.repository.findByArchiveId(archiveId);
    if (!record) {
      return [];
    }
    return this.repository.findVersions(record.connectorId, record.originalUrl);
  }

  exists(sha256: string): boolean {
    return this.repository.exists(sha256);
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
