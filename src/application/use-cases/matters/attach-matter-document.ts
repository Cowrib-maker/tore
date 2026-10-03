import {
  assertValidLegalAiDocumentUpload,
  type ValidatedLegalAiDocument,
} from "@/application/ai/document-upload-validation";
import {
  LEGAL_AI_OCR_EMPTY_MESSAGE,
  LEGAL_AI_OCR_FAILED_MESSAGE,
  type LegalAiDocumentExtractStatus,
  type LegalAiDocumentFormat,
} from "@/application/ai/legal-ai-document.constants";
import type { ActorContext } from "@/application/common/actor-context";
import type { MatterDocument } from "@/domain/entities/matter-document";
import { ValidationError } from "@/domain/errors/domain-error";
import { DocumentUploadError } from "@/domain/errors/document-upload-errors";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { MatterDocumentRepository } from "@/domain/repositories/matter-document-repository";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import type { LegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";

import { requireOwnedMatter } from "./assert-access";
import {
  MATTER_DOCUMENT_MAX_BYTES,
  MATTER_DOCUMENT_OCR_UNSUPPORTED_MESSAGE,
  MATTER_DOCUMENT_PROCESSING_TIMEOUT_MS,
  MATTER_DOCUMENT_SAVE_MESSAGE,
  MATTER_DOCUMENT_SIZE_MESSAGE,
  MATTER_DOCUMENT_STORAGE_MESSAGE,
  MATTER_DOCUMENT_TIMEOUT_MESSAGE,
} from "./matter-document-policy";
import {
  describeUploadFailure,
  logMatterDocumentUpload,
} from "./matter-document-upload-log";

export type AttachMatterDocumentInput = {
  matterId: string;
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export type AttachMatterDocumentResult = {
  id: string;
  matterId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractStatus: LegalAiDocumentExtractStatus;
  pageCount: number | null;
};

export type AttachMatterDocumentDeps = {
  matterRepository: MatterRepository;
  matterDocumentRepository: MatterDocumentRepository;
  fileStorage: FileStorage;
  extractor: LegalAiDocumentExtractor;
  /** Test seam; defaults to MATTER_DOCUMENT_PROCESSING_TIMEOUT_MS. */
  processingTimeoutMs?: number;
};

const IMAGE_FORMATS = new Set<LegalAiDocumentFormat>(["jpeg", "png", "webp"]);

const FAILED_PDF_MESSAGE =
  "PDF файлыг уншиж чадсангүй. Файлыг шалгаад дахин оролдоно уу.";
const FAILED_DOCX_MESSAGE =
  "DOCX файлыг уншиж чадсангүй. Файлыг шалгаад дахин оролдоно уу.";
const EMPTY_DOCX_MESSAGE = "Энэ DOCX-ээс уншигдах текст олдсонгүй.";
const FAILED_XLSX_MESSAGE =
  "Excel файлыг уншиж чадсангүй. Файлыг шалгаад дахин оролдоно уу.";
const EMPTY_XLSX_MESSAGE = "Энэ Excel файлаас уншигдах өгөгдөл олдсонгүй.";
const FAILED_TEXT_MESSAGE =
  "Файлыг уншиж чадсангүй. Файлыг шалгаад дахин оролдоно уу.";
const EMPTY_TEXT_MESSAGE = "Энэ файлаас уншигдах текст олдсонгүй.";

/**
 * Authorize → validate size/type → extract (bounded, no OCR) → store → persist.
 * Same contract as attachConversationDocumentUseCase minus conversation
 * resolution: a MatterDocument attaches directly to an already-ownership-
 * verified Matter. Anything that fails before the storage write never reaches
 * FileStorage or the DB; a DB failure after the storage write deletes the blob.
 * Every failure is a typed DocumentUploadError (or the ownership errors).
 */
export async function attachMatterDocumentUseCase(
  actor: ActorContext,
  input: AttachMatterDocumentInput,
  deps: AttachMatterDocumentDeps,
): Promise<AttachMatterDocumentResult> {
  const { matterId } = input;
  const startedAt = Date.now();
  const sizeBytes = input.body.byteLength;
  const elapsed = () => Date.now() - startedAt;

  // 1. Actor + Matter ownership, before the file is read by anything else.
  await requireOwnedMatter(actor, matterId, deps.matterRepository);

  // 2. Size / type contract (cheap, no parsing).
  if (sizeBytes > MATTER_DOCUMENT_MAX_BYTES) {
    logMatterDocumentUpload("size_rejected", {
      matterId,
      code: "FILE_TOO_LARGE",
      sizeBytes,
    });
    throw new DocumentUploadError("FILE_TOO_LARGE", MATTER_DOCUMENT_SIZE_MESSAGE);
  }

  let validated: ValidatedLegalAiDocument;
  try {
    validated = assertValidLegalAiDocumentUpload({
      fileName: input.fileName,
      contentType: input.contentType,
      body: input.body,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      logMatterDocumentUpload("unsupported_type", {
        matterId,
        code: "UNSUPPORTED_FILE_TYPE",
        sizeBytes,
      });
      throw new DocumentUploadError("UNSUPPORTED_FILE_TYPE", error.message);
    }
    throw error;
  }

  if (IMAGE_FORMATS.has(validated.format)) {
    logMatterDocumentUpload("ocr_unsupported", {
      matterId,
      code: "OCR_UNSUPPORTED",
      format: validated.format,
      sizeBytes,
    });
    throw new DocumentUploadError(
      "OCR_UNSUPPORTED",
      MATTER_DOCUMENT_OCR_UNSUPPORTED_MESSAGE,
    );
  }

  // 3. Extract under a hard budget. OCR is never started for Matter uploads:
  // Tesseract traineddata/WASM availability in the serverless runtime is not
  // proven, so scanned PDFs fail fast instead of hanging or half-working.
  // Extractors may detach the ArrayBuffer, so they get their own slice()
  // (never subarray()) — input.body must stay valid for the storage write.
  let extracted: Awaited<ReturnType<LegalAiDocumentExtractor["extract"]>>;
  try {
    extracted = await withProcessingTimeout(
      deps.extractor.extract({
        format: validated.format,
        body: input.body.slice(),
        allowOcr: false,
      }),
      deps.processingTimeoutMs ?? MATTER_DOCUMENT_PROCESSING_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof ProcessingTimeoutError) {
      logMatterDocumentUpload("extraction_timeout", {
        matterId,
        code: "DOCUMENT_PROCESSING_TIMEOUT",
        format: validated.format,
        sizeBytes,
        elapsedMs: elapsed(),
      });
      throw new DocumentUploadError(
        "DOCUMENT_PROCESSING_TIMEOUT",
        MATTER_DOCUMENT_TIMEOUT_MESSAGE,
      );
    }
    logMatterDocumentUpload("extraction_failed", {
      matterId,
      code: "DOCUMENT_EXTRACTION_FAILED",
      format: validated.format,
      sizeBytes,
      elapsedMs: elapsed(),
      reason: describeUploadFailure(error),
    });
    throw new DocumentUploadError(
      "DOCUMENT_EXTRACTION_FAILED",
      failedExtractMessage(validated.format),
      { cause: error },
    );
  }

  if (extracted.status === "NEEDS_OCR") {
    logMatterDocumentUpload("ocr_unsupported", {
      matterId,
      code: "OCR_UNSUPPORTED",
      format: validated.format,
      sizeBytes,
      elapsedMs: elapsed(),
    });
    throw new DocumentUploadError(
      "OCR_UNSUPPORTED",
      MATTER_DOCUMENT_OCR_UNSUPPORTED_MESSAGE,
    );
  }
  if (
    extracted.status === "FAILED" ||
    extracted.status === "EMPTY" ||
    !extracted.text
  ) {
    logMatterDocumentUpload("extraction_failed", {
      matterId,
      code: "DOCUMENT_EXTRACTION_FAILED",
      format: validated.format,
      sizeBytes,
      elapsedMs: elapsed(),
      reason: `extract status ${extracted.status}`,
    });
    throw new DocumentUploadError(
      "DOCUMENT_EXTRACTION_FAILED",
      extracted.status === "FAILED"
        ? failedExtractMessage(validated.format)
        : emptyExtractMessage(validated.format),
    );
  }

  // 4. Storage, then DB. A failed extract above never reaches either.
  let stored: Awaited<ReturnType<FileStorage["upload"]>>;
  try {
    stored = await deps.fileStorage.upload({
      purpose: "matter-document",
      ownerId: actor.userId,
      fileName: input.fileName,
      contentType: validated.mimeType,
      body: input.body,
    });
  } catch (error) {
    logMatterDocumentUpload("storage_failed", {
      matterId,
      code: "STORAGE_FAILED",
      format: validated.format,
      sizeBytes,
      elapsedMs: elapsed(),
      reason: describeUploadFailure(error),
    });
    throw new DocumentUploadError(
      "STORAGE_FAILED",
      MATTER_DOCUMENT_STORAGE_MESSAGE,
      { cause: error },
    );
  }

  try {
    const document: MatterDocument = await deps.matterDocumentRepository.create({
      matterId,
      uploadedByUserId: actor.userId,
      storageKey: stored.key,
      fileName: stored.originalFileName || input.fileName,
      mimeType: validated.mimeType,
      sizeBytes: stored.sizeBytes,
      extractedText: extracted.text,
      pageCount: extracted.pageCount,
      extractStatus: extracted.status,
    });

    return {
      id: document.id,
      matterId: document.matterId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      extractStatus: document.extractStatus,
      pageCount: document.pageCount,
    };
  } catch (error) {
    logMatterDocumentUpload("db_failed", {
      matterId,
      code: "DOCUMENT_SAVE_FAILED",
      format: validated.format,
      sizeBytes,
      elapsedMs: elapsed(),
      reason: describeUploadFailure(error),
    });
    // Do not leave an orphan blob behind a missing DB row.
    await deps.fileStorage.delete(stored.key).catch((cleanupError: unknown) => {
      logMatterDocumentUpload("orphan_cleanup_failed", {
        matterId,
        reason: describeUploadFailure(cleanupError),
      });
    });
    throw new DocumentUploadError(
      "DOCUMENT_SAVE_FAILED",
      MATTER_DOCUMENT_SAVE_MESSAGE,
      { cause: error },
    );
  }
}

class ProcessingTimeoutError extends Error {
  constructor() {
    super("document processing timed out");
    this.name = "ProcessingTimeoutError";
  }
}

async function withProcessingTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProcessingTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function failedExtractMessage(format: LegalAiDocumentFormat): string {
  if (format === "docx") {
    return FAILED_DOCX_MESSAGE;
  }
  if (format === "pdf") {
    return FAILED_PDF_MESSAGE;
  }
  if (format === "xlsx") {
    return FAILED_XLSX_MESSAGE;
  }
  if (format === "txt" || format === "csv") {
    return FAILED_TEXT_MESSAGE;
  }
  return LEGAL_AI_OCR_FAILED_MESSAGE;
}

function emptyExtractMessage(format: LegalAiDocumentFormat): string {
  if (format === "docx") {
    return EMPTY_DOCX_MESSAGE;
  }
  if (format === "xlsx") {
    return EMPTY_XLSX_MESSAGE;
  }
  if (format === "txt" || format === "csv") {
    return EMPTY_TEXT_MESSAGE;
  }
  return LEGAL_AI_OCR_EMPTY_MESSAGE;
}
