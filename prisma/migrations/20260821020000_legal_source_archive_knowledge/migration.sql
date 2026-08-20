-- Legal source archive metadata + structured knowledge (PostgreSQL).
-- Blob bytes remain in object storage; DB holds verified provenance only.

CREATE TABLE "legal_source_archives" (
    "id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "law_id" TEXT,
    "jurisdiction" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "sha256" TEXT NOT NULL,
    "checksum_verified" BOOLEAN NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "archive_version" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "encoding" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_source_archives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_source_archives_sha256_key" ON "legal_source_archives"("sha256");
CREATE UNIQUE INDEX "legal_source_archives_connector_id_original_url_archive_version_key" ON "legal_source_archives"("connector_id", "original_url", "archive_version");
CREATE INDEX "legal_source_archives_original_url_idx" ON "legal_source_archives"("original_url");
CREATE INDEX "legal_source_archives_law_id_idx" ON "legal_source_archives"("law_id");
CREATE INDEX "legal_source_archives_source_id_law_id_idx" ON "legal_source_archives"("source_id", "law_id");

CREATE TABLE "legal_knowledge_documents" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "law_id" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "document_type" TEXT,
    "article_count" INTEGER NOT NULL,
    "chunk_count" INTEGER NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "archive_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ingested_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_knowledge_documents_source_url_content_sha256_key" ON "legal_knowledge_documents"("source_url", "content_sha256");
CREATE INDEX "legal_knowledge_documents_source_url_idx" ON "legal_knowledge_documents"("source_url");
CREATE INDEX "legal_knowledge_documents_law_id_idx" ON "legal_knowledge_documents"("law_id");
CREATE INDEX "legal_knowledge_documents_archive_id_idx" ON "legal_knowledge_documents"("archive_id");

CREATE TABLE "legal_knowledge_articles" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "article_number" TEXT,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "legal_knowledge_articles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_knowledge_articles_document_id_order_idx" ON "legal_knowledge_articles"("document_id", "order");

CREATE TABLE "legal_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "article_number" TEXT,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "token_estimate" INTEGER NOT NULL,

    CONSTRAINT "legal_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_knowledge_chunks_document_id_order_idx" ON "legal_knowledge_chunks"("document_id", "order");

ALTER TABLE "legal_knowledge_documents" ADD CONSTRAINT "legal_knowledge_documents_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "legal_source_archives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_knowledge_articles" ADD CONSTRAINT "legal_knowledge_articles_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_knowledge_chunks" ADD CONSTRAINT "legal_knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
