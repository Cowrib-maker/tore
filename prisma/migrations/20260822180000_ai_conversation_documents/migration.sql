-- Legal AI Document Intelligence v0.1: one PDF extract per AI conversation.
-- Raw PDF bytes stay in FileStorage; Postgres stores extracted text only.

CREATE TYPE "AIDocumentExtractStatus" AS ENUM ('OK', 'EMPTY', 'FAILED');

CREATE TABLE "ai_conversation_documents" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "extracted_text" TEXT NOT NULL,
    "page_count" INTEGER,
    "extract_status" "AIDocumentExtractStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_conversation_documents_conversation_id_key"
  ON "ai_conversation_documents"("conversation_id");
CREATE UNIQUE INDEX "ai_conversation_documents_storage_key_key"
  ON "ai_conversation_documents"("storage_key");
CREATE INDEX "ai_conversation_documents_user_id_idx"
  ON "ai_conversation_documents"("user_id");

ALTER TABLE "ai_conversation_documents"
  ADD CONSTRAINT "ai_conversation_documents_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_documents"
  ADD CONSTRAINT "ai_conversation_documents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
