-- Link Legal AI conversations to lawyer-owned case files.
-- Existing conversations remain valid with NULL case_file_id.

ALTER TABLE "ai_conversations"
  ADD COLUMN "case_file_id" TEXT;

CREATE INDEX "ai_conversations_case_file_id_updated_at_idx"
  ON "ai_conversations"("case_file_id", "updated_at" DESC);

ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_case_file_id_fkey"
  FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
