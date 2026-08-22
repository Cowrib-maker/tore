-- Identical archive bytes (SHA-256) must not create a second knowledge row
-- merely because sourceUrl differs. First ingested URL/provenance is kept.
-- (sourceUrl, contentSha256) uniqueness remains for same-URL idempotency.

CREATE UNIQUE INDEX "legal_knowledge_documents_content_sha256_key" ON "legal_knowledge_documents"("content_sha256");
