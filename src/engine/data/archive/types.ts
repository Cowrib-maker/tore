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

export type ArchiveRecord = {
  archiveId: string;
  connectorId: string;
  jurisdiction: string;
  authority: string;
  sourceType: string;
  originalUrl: string;
  downloadedAt: string;
  sha256: string;
  checksumVerified: boolean;
  mimeType: string;
  fileSize: number;
  archiveVersion: number;
  storageKey: string;
  originalFileName: string;
  encoding?: string;
};

export type ArchiveStoreInput = {
  bytes: Uint8Array;
  connectorId: string;
  jurisdiction: string;
  authority: string;
  sourceType: string;
  originalUrl: string;
  originalFileName: string;
  mimeType?: string;
  encoding?: string;
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

export interface IArchiveRepository {
  save(record: ArchiveRecord): void;
  findByHash(sha256: string): ArchiveRecord | null;
  findByArchiveId(archiveId: string): ArchiveRecord | null;
  findVersions(connectorId: string, originalUrl: string): ArchiveRecord[];
  exists(sha256: string): boolean;
}

export type ArchiveServiceDependencies = {
  repository: IArchiveRepository;
  storage: IArchiveStorage;
};
