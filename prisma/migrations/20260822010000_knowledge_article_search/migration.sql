-- Article-level rule retrieval: persist temporal metadata and search indexes.
-- Does not reload or mutate archived LegalInfo blobs.

ALTER TABLE "legal_knowledge_documents"
  ADD COLUMN "valid_from" TEXT,
  ADD COLUMN "valid_to" TEXT,
  ADD COLUMN "source_version" TEXT;

CREATE INDEX "legal_knowledge_documents_source_id_idx"
  ON "legal_knowledge_documents"("source_id");

CREATE INDEX "legal_knowledge_documents_jurisdiction_document_type_idx"
  ON "legal_knowledge_documents"("jurisdiction", "document_type");

CREATE INDEX "legal_knowledge_articles_article_number_idx"
  ON "legal_knowledge_articles"("article_number");

CREATE INDEX "legal_knowledge_articles_document_id_article_number_idx"
  ON "legal_knowledge_articles"("document_id", "article_number");

CREATE INDEX "legal_knowledge_chunks_document_id_article_number_idx"
  ON "legal_knowledge_chunks"("document_id", "article_number");
