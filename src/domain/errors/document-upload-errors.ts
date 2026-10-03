import { DomainError } from "@/domain/errors/domain-error";

export const DOCUMENT_UPLOAD_ERROR_CODES = {
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  DOCUMENT_EXTRACTION_FAILED: 422,
  OCR_UNSUPPORTED: 422,
  DOCUMENT_PROCESSING_TIMEOUT: 504,
  STORAGE_FAILED: 502,
  DOCUMENT_SAVE_FAILED: 500,
} as const;

export type DocumentUploadErrorCode = keyof typeof DOCUMENT_UPLOAD_ERROR_CODES;

/**
 * Typed, client-safe upload failure. `message` is user-facing copy only —
 * infrastructure detail (stack, paths, storage keys) goes to server logs via
 * `cause`, never into the message.
 */
export class DocumentUploadError extends DomainError {
  constructor(
    public readonly uploadCode: DocumentUploadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, uploadCode, DOCUMENT_UPLOAD_ERROR_CODES[uploadCode]);
    this.name = "DocumentUploadError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
