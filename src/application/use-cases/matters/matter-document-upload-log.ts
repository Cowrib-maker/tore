import type { DocumentUploadErrorCode } from "@/domain/errors/document-upload-errors";

export type MatterDocumentUploadLogEvent =
  | "size_rejected"
  | "unsupported_type"
  | "ocr_unsupported"
  | "extraction_failed"
  | "extraction_timeout"
  | "storage_failed"
  | "db_failed"
  | "orphan_cleanup_failed"
  | "unexpected_error";

export type MatterDocumentUploadLogFields = {
  matterId: string;
  code?: DocumentUploadErrorCode;
  format?: string;
  sizeBytes?: number;
  elapsedMs?: number;
  /** Error class + message only; never a stack, document text, or storage key. */
  reason?: string;
};

/**
 * One structured JSON line per failure so log search can split by `event`.
 * Never pass document contents, file names, tokens, or storage keys.
 */
export function logMatterDocumentUpload(
  event: MatterDocumentUploadLogEvent,
  fields: MatterDocumentUploadLogFields,
): void {
  const line = JSON.stringify({
    scope: "matter-document-upload",
    event,
    ...fields,
  });
  if (
    event === "size_rejected" ||
    event === "unsupported_type" ||
    event === "ocr_unsupported"
  ) {
    console.warn(line);
    return;
  }
  console.error(line);
}

export function describeUploadFailure(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 300);
  }
  return "non-error thrown";
}
