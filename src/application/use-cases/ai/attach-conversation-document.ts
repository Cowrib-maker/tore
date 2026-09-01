import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type { LegalAiStore } from "@/application/ai/legal-ai.types";
import { assertValidLegalAiDocumentUpload } from "@/application/ai/document-upload-validation";
import {
  LEGAL_AI_OCR_EMPTY_MESSAGE,
  LEGAL_AI_OCR_FAILED_MESSAGE,
  LEGAL_AI_OCR_TIMEOUT_MESSAGE,
  type LegalAiDocumentExtractStatus,
  type LegalAiDocumentFormat,
} from "@/application/ai/legal-ai-document.constants";
import { ValidationError } from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { LegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";

export type AttachConversationDocumentInput = {
  userId: string;
  conversationId?: string;
  caseFileId?: string;
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export type AttachConversationDocumentResult = {
  id: string;
  conversationId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractStatus: LegalAiDocumentExtractStatus;
  pageCount: number | null;
};

export type AttachConversationDocumentDeps = {
  store: LegalAiStore;
  fileStorage: FileStorage;
  extractor: LegalAiDocumentExtractor;
};

const FAILED_PDF_MESSAGE =
  "PDF файлыг уншиж чадсангүй. Файлыг шалгаад дахин оролдоно уу.";
const FAILED_DOCX_MESSAGE =
  "DOCX файлыг уншиж чадсангүй. Файлыг шалгаад дахин оролдоно уу.";
const EMPTY_DOCX_MESSAGE =
  "Энэ DOCX-ээс уншигдах текст олдсонгүй.";

/**
 * Validate → extract → store. FAILED extracts never reach FileStorage.
 * Successful OCR is persisted as OK. NEEDS_OCR is only persisted when OCR
 * cannot run (scanned PDF with no extractable page images).
 * Does not call OpenAI. Does not increment usage (the HTTP layer does that
 * only after this use case succeeds).
 */
export async function attachConversationDocumentUseCase(
  input: AttachConversationDocumentInput,
  deps: AttachConversationDocumentDeps,
): Promise<AttachConversationDocumentResult> {
  const validated = assertValidLegalAiDocumentUpload({
    fileName: input.fileName,
    contentType: input.contentType,
    body: input.body,
  });

  const extracted = await deps.extractor.extract({
    format: validated.format,
    body: input.body,
  });

  const normalized = normalizeExtract(validated.format, extracted);

  if (normalized.status === "FAILED") {
    throw new ValidationError(
      failedExtractMessage(validated.format, extracted.timedOut === true),
    );
  }
  if (normalized.status === "EMPTY") {
    throw new ValidationError(
      validated.format === "docx" ? EMPTY_DOCX_MESSAGE : LEGAL_AI_OCR_EMPTY_MESSAGE,
    );
  }
  if (normalized.status === "OK" && !normalized.text) {
    throw new ValidationError(
      validated.format === "docx" ? EMPTY_DOCX_MESSAGE : LEGAL_AI_OCR_EMPTY_MESSAGE,
    );
  }

  const conversation = await resolveOwnedConversation(
    input.userId,
    input.conversationId,
    input.caseFileId,
    input.fileName,
    deps.store,
  );

  const stored = await deps.fileStorage.upload({
    purpose: "legal-ai-document",
    ownerId: input.userId,
    fileName: input.fileName,
    contentType: validated.mimeType,
    body: input.body,
  });

  try {
    const document = await deps.store.createConversationDocument({
      conversationId: conversation.id,
      userId: input.userId,
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
      conversationId: conversation.id,
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
  return LEGAL_AI_OCR_FAILED_MESSAGE;
}

function normalizeExtract(
  _format: LegalAiDocumentFormat,
  extracted: {
    status: LegalAiDocumentExtractStatus;
    text: string;
    pageCount: number | null;
  },
): {
  status: LegalAiDocumentExtractStatus;
  text: string;
  pageCount: number | null;
} {
  if (extracted.status === "NEEDS_OCR") {
    return { ...extracted, text: "" };
  }
  return extracted;
}

async function resolveOwnedConversation(
  userId: string,
  conversationId: string | undefined,
  caseFileId: string | undefined,
  fileName: string,
  store: LegalAiStore,
) {
  if (!conversationId) {
    return store.createConversation({
      userId,
      title: fileName.slice(0, 80),
      caseFileId,
    });
  }

  const existing = await store.findOwnedConversation(conversationId, userId);
  if (!existing) {
    throw new LegalAiError("Яриа олдсонгүй.", 404);
  }
  return existing;
}
