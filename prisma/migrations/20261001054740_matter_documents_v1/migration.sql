-- CreateTable
CREATE TABLE "matter_documents" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "extracted_text" TEXT NOT NULL,
    "page_count" INTEGER,
    "extract_status" "AIDocumentExtractStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matter_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "matter_documents_storage_key_key" ON "matter_documents"("storage_key");

-- CreateIndex
CREATE INDEX "matter_documents_matter_id_created_at_idx" ON "matter_documents"("matter_id", "created_at");

-- AddForeignKey
ALTER TABLE "matter_documents" ADD CONSTRAINT "matter_documents_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matter_documents" ADD CONSTRAINT "matter_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

