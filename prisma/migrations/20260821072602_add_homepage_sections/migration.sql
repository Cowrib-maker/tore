-- CreateTable
CREATE TABLE "homepage_sections" (
    "key" TEXT NOT NULL,
    "image_key" TEXT,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "legal_source_archives_connector_id_original_url_archive_version" RENAME TO "legal_source_archives_connector_id_original_url_archive_ver_key";
