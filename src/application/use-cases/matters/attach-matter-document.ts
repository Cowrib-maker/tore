import { assertValidLegalAiDocumentUpload } from "@/application/ai/document-upload-validation";
import {
  LEGAL_AI_OCR_EMPTY_MESSAGE,
  LEGAL_AI_OCR_FAILED_MESSAGE,
  LEGAL_AI_OCR_TIMEOUT_MESSAGE,
  type LegalAiDocumentExtractStatus,
  type LegalAiDocumentFormat,
} from "@/application/ai/legal-ai-document.constants";
import type { ActorContext } from "@/application/common/actor-context";
import type { MatterDocument } from "@/domain/entities/matter-document";
import { ValidationError } from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { MatterDocumentRepository } from "@/domain/repositories/matter-document-repository";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import type { LegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";

import { requireOwnedMatter } from "./assert-access";

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
};

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
 * Validate → extract → store, same contract as attachConversationDocumentUseCase
 * (src/application/use-cases/ai/attach-conversation-document.ts) minus the
 * conversation-resolution step: a MatterDocument attaches directly to an
 * already-ownership-verified Matter, never to a conversation. FAILED/EMPTY
 * extracts never reach FileStorage. Authorization happens before the file is
 * ever read into the extractor or storage.
 */
export async function attachMatterDocumentUseCase(
  actor: ActorContext,
  input: AttachMatterDocumentInput,
  deps: AttachMatterDocumentDeps,
): Promise<AttachMatterDocumentResult> {
  await requireOwnedMatter(actor, input.matterId, deps.matterRepository);

  const validated = assertValidLegalAiDocumentUpload({
    fileName: input.fileName,
    contentType: input.contentType,
    body: input.body,
  });

  // See attach-conversation-document.ts's identical comment: extractors may
  // detach/transfer the underlying ArrayBuffer, so the extractor gets its
  // own independent copy via slice() (never subarray()) — input.body must
  // still be valid for the storage write further down.
  const extracted = await deps.extractor.extract({
    format: validated.format,
    body: input.body.slice(),
  });

  const normalized = normalizeExtract(extracted);

  if (normalized.status === "FAILED") {
    throw new ValidationError(
      failedExtractMessage(validated.format, extracted.timedOut === true),
    );
  }
  if (normalized.status === "EMPTY") {
    throw new ValidationError(emptyExtractMessage(validated.format));
  }
  if (normalized.status === "OK" && !normalized.text) {
    throw new ValidationError(emptyExtractMessage(validated.format));
  }

  const stored = await deps.fileStorage.upload({
    purpose: "matter-document",
    ownerId: actor.userId,
    fileName: input.fileName,
    contentType: validated.mimeType,
    body: input.body,
  });

  try {
    const document: MatterDocument = await deps.matterDocumentRepository.create({
      matterId: input.matterId,
      uploadedByUserId: actor.userId,
      storageKey: stored.key,
      fileName: stored.originalFileName || input.fileName,
      mimeType: validated.mimeType,
      sizeBytes: stored.sizeBytes,
      extractedText: normalized.text,
      pageCount: normalized.pageCount,
      extractStatus: normalized.status,
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
    await deps.fileStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}

function failedExtractMessage(
  format: LegalAiDocumentFormat,
  timedOut: boolean,
): string {
  if (timedOut) {
    return LEGAL_AI_OCR_TIMEOUT_MESSAGE;
  }
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

function normalizeExtract(extracted: {
  status: LegalAiDocumentExtractStatus;
  text: string;
  pageCount: number | null;
}): {
  status: LegalAiDocumentExtractStatus;
  text: string;
  pageCount: number | null;
} {
  if (extracted.status === "NEEDS_OCR") {
    return { ...extracted, text: "" };
  }
  return extracted;
}
