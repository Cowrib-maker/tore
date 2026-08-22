/**
 * TORE Raw Archive.
 *
 * Immutable store of original legal source artifacts.
 * Storage is replaceable; metadata is insert-only.
 */

export type {
  ArchiveArtifactFormat,
  ArchiveHealth,
  ArchiveRecord,
  ArchiveServiceDependencies,
  ArchiveStoreInput,
  ArchiveStoreResult,
  IArchiveRepository,
  IArchiveStorage,
} from "./types";
export { ArchiveArtifactFormat as ArchiveFormat } from "./types";

export { sha256Hex, storageKeyForHash } from "./hash";
export {
  canonicalizeLegalSourceBytes,
  contentSha256Hex,
  rawSha256Hex,
  LEGALINFO_CAPTCHA_NONCE_PATTERN,
  LEGALINFO_CAPTCHA_STABLE,
} from "./canonicalize";
export { mimeTypeForFileName, SUPPORTED_MIME_TYPES } from "./mime";
export { InMemoryArchiveRepository } from "./in-memory-archive.repository";
export { LocalFilesystemArchiveStorage } from "./local-filesystem.storage";
export { S3ArchiveStorage } from "./s3-archive.storage";
export type { S3ArchiveStorageOptions } from "./s3-archive.storage";
export { ArchiveService, createArchiveService } from "./archive.service";
