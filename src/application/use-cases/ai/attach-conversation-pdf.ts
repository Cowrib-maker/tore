import { LEGAL_AI_DOCUMENT_MIME } from "@/application/ai/legal-ai-document.constants";
import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type { LegalAiStore } from "@/application/ai/legal-ai.types";
import { assertValidPdfUpload } from "@/application/ai/pdf-upload-validation";
import { ConflictError, ValidationError } from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { PdfTextExtractor } from "@/infrastructure/ai/pdf-text-extractor";

export type AttachConversationPdfInput = {
  userId: string;
  conversationId?: string;
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export type AttachConversationPdfResult = {
  id: string;
  conversationId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractStatus: "OK";
  pageCount: number | null;
};

export type AttachConversationPdfDeps = {
  store: LegalAiStore;
  fileStorage: FileStorage;
  extractor: PdfTextExtractor;
};

const EMPTY_EXTRACT_MESSAGE =
  "Энэ PDF-ээс уншигдах текст олдсонгүй. Скан хийсэн эсвэл зурган PDF-ийг одоогоор дэмжихгүй.";
const FAILED_EXTRACT_MESSAGE =
  "PDF файлыг уншиж чадсангүй. Файлыг шалгаад дахин оролдоно уу.";
const SECOND_DOCUMENT_MESSAGE =
  "Энэ ярианд аль хэдийн нэг PDF хавсаргасан байна.";

/**
 * Validate → extract → store. Invalid or empty PDFs never reach FileStorage.
 * Does not call OpenAI. Does not increment usage (the HTTP layer does that
 * only after this use case succeeds).
 */
export async function attachConversationPdfUseCase(
  input: AttachConversationPdfInput,
  deps: AttachConversationPdfDeps,
): Promise<AttachConversationPdfResult> {
  assertValidPdfUpload({
    fileName: input.fileName,
    contentType: input.contentType,
    body: input.body,
  });

  const extracted = await deps.extractor.extract(input.body);
  if (extracted.status === "EMPTY") {
    throw new ValidationError(EMPTY_EXTRACT_MESSAGE);
  }
  if (extracted.status === "FAILED" || !extracted.text) {
    throw new ValidationError(FAILED_EXTRACT_MESSAGE);
  }

  const conversation = await resolveOwnedConversation(
    input.userId,
    input.conversationId,
    input.fileName,
    deps.store,
  );

  const existing = await deps.store.findDocumentIdByConversationId(
    conversation.id,
  );
  if (existing) {
    throw new ConflictError(SECOND_DOCUMENT_MESSAGE);
  }

  const stored = await deps.fileStorage.upload({
    purpose: "legal-ai-document",
    ownerId: input.userId,
    fileName: input.fileName,
    contentType: LEGAL_AI_DOCUMENT_MIME,
    body: input.body,
  });

  try {
    const document = await deps.store.createConversationDocument({
      conversationId: conversation.id,
      userId: input.userId,
      storageKey: stored.key,
      fileName: stored.originalFileName || input.fileName,
      mimeType: LEGAL_AI_DOCUMENT_MIME,
      sizeBytes: stored.sizeBytes,
      extractedText: extracted.text,
      pageCount: extracted.pageCount,
      extractStatus: "OK",
    });

    return {
      id: document.id,
      conversationId: conversation.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      extractStatus: "OK",
      pageCount: document.pageCount,
    };
  } catch (error) {
    await deps.fileStorage.delete(stored.key).catch(() => undefined);
    if (isUniqueConstraint(error)) {
      throw new ConflictError(SECOND_DOCUMENT_MESSAGE);
    }
    throw error;
  }
}

async function resolveOwnedConversation(
  userId: string,
  conversationId: string | undefined,
  fileName: string,
  store: LegalAiStore,
) {
  if (!conversationId) {
    return store.createConversation({
      userId,
      title: fileName.slice(0, 80),
    });
  }

  const existing = await store.findOwnedConversation(conversationId, userId);
  if (!existing) {
    throw new LegalAiError("Яриа олдсонгүй.", 404);
  }
  return existing;
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
