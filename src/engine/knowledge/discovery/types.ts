export const LEGALINFO_MANIFEST_VERSION = 1 as const;

export const LegalInfoDocumentStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  SKIPPED_DUPLICATE: "SKIPPED_DUPLICATE",
} as const;

export type LegalInfoDocumentStatus =
  (typeof LegalInfoDocumentStatus)[keyof typeof LegalInfoDocumentStatus];

export type LegalInfoSourceType = "law" | "constitution" | "other";

export type LegalInfoManifestDocument = {
  lawId: string;
  officialUrl: string;
  sourceType: LegalInfoSourceType;
  categoryId: string | null;
  title: string | null;
  discoveredAt: string;
  status: LegalInfoDocumentStatus;
  /** Set when status is FAILED. */
  failureReason: string | null;
  /** Content SHA-256 after successful archive/ingest (canonical legal source). */
  sha256: string | null;
  /** When SKIPPED_DUPLICATE, points at the first SUCCESS lawId. */
  duplicateOfLawId: string | null;
  articleCount: number | null;
  chunkCount: number | null;
  byteSize: number | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  attempts: number;
};

export type LegalInfoManifest = {
  version: typeof LEGALINFO_MANIFEST_VERSION;
  createdAt: string;
  updatedAt: string;
  source: "legalinfo.mn";
  /** Category ids used for discovery. */
  categoryIds: string[];
  documents: LegalInfoManifestDocument[];
  /** Cursor for resumable ingestion (lawId or null). */
  checkpoint: {
    lastProcessedLawId: string | null;
    lastDiscoveryPageByCategory: Record<string, number>;
  };
};
