-- Preserve raw HTTP SHA on legal_source_archives.sha256.
-- Add canonical legal-content SHA so captcha cache-busters do not fork identity.
-- Existing rows have no stored blobs in this environment; backfill content_sha256 = sha256.

ALTER TABLE "legal_source_archives" ADD COLUMN "content_sha256" TEXT;

UPDATE "legal_source_archives" SET "content_sha256" = "sha256" WHERE "content_sha256" IS NULL;

ALTER TABLE "legal_source_archives" ALTER COLUMN "content_sha256" SET NOT NULL;

CREATE UNIQUE INDEX "legal_source_archives_content_sha256_key" ON "legal_source_archives"("content_sha256");
