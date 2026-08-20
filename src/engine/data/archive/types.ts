/**
 * Immutable raw archive of original legal source artifacts.
 * No crawl, parse, graph, or model processing.
 */

export const ArchiveArtifactFormat = {
  HTML: "html",
  PDF: "pdf",
  DOCX: "docx",
  XML: "xml",
  JSON: "json",
  ZIP: "zip",
  TXT: "txt",
} as const;

export type ArchiveArtifactFormat =
  (typeof ArchiveArtifactFormat)[keyof typeof ArchiveArtifactFormat];

/**
 * Durable metadata for one immutable source snapshot.
 * Blobs live in {@link IArchiveStorage}; this record is insert-only.
 */
export type ArchiveRecord = {
  archiveId: string;
  /** Connector / pipeline id (e.g. mn.legalinfo). */
  connectorId: string;
  /** Human / registry source name (e.g. legalinfo.mn). */
  source: string;
  /** Stable source catalog id (e.g. legalinfo). */
  sourceId: string;
  /** Document identity within the source (e.g. LegalInfo lawId). */
  lawId: string | null;
  jurisdiction: string;
  authority: string;
  sourceType: string;
  originalUrl: string;
  /** ISO-8601 fetch time. */
  fetchedAt: string;
  sha256: string;
  checksumVerified: boolean;
  mimeType: string;
  byteSize: number;
  archiveVersion: number;
  storageKey: string;
  originalFileName: string;
  encoding?: string;
};

export type ArchiveStoreInput = {
  bytes: Uint8Array;
  connectorId: string;
  source: string;
  sourceId: string;
  lawId?: string | null;
  jurisdiction: string;
  authority: string;
  sourceType: string;
  originalUrl: string;
  originalFileName: string;
  mimeType?: string;
  encoding?: string;
  fetchedAt?: string;
  /** @deprecated Prefer fetchedAt */
  downloadedAt?: string;
};

export type ArchiveStoreResult = {
  record: ArchiveRecord;
  created: boolean;
};

export type ArchiveHealth = {
  ok: boolean;
  storage: string;
  checkedAt: string;
  detail: string;
};

export interface IArchiveStorage {
  putIfAbsent(key: string, bytes: Uint8Array): Promise<{ written: boolean }>;
  get(key: string): Promise<Uint8Array | null>;
  has(key: string): Promise<boolean>;
  health(): Promise<ArchiveHealth>;
}

/**
 * Insert-only archive metadata. Implementations may be in-memory or PostgreSQL.
 */
export interface IArchiveRepository {
  save(record: ArchiveRecord): Promise<void>;
  findByHash(sha256: string): Promise<ArchiveRecord | null>;
  findByArchiveId(archiveId: string): Promise<ArchiveRecord | null>;
  findVersions(
    connectorId: string,
    originalUrl: string,
  ): Promise<ArchiveRecord[]>;
  exists(sha256: string): Promise<boolean>;
}

export type ArchiveServiceDependencies = {
  repository: IArchiveRepository;
  storage: IArchiveStorage;
};
