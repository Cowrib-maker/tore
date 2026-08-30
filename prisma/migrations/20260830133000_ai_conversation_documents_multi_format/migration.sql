-- Multiple Legal AI attachments per conversation; NEEDS_OCR for images/scans.

ALTER TYPE "AIDocumentExtractStatus" ADD VALUE IF NOT EXISTS 'NEEDS_OCR';

DROP INDEX IF EXISTS "ai_conversation_documents_conversation_id_key";

CREATE INDEX IF NOT EXISTS "ai_conversation_documents_conversation_id_created_at_idx"
  ON "ai_conversation_documents"("conversation_id", "created_at");
