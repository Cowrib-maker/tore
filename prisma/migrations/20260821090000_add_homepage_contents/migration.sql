-- CreateTable
CREATE TABLE "homepage_contents" (
    "locale" TEXT NOT NULL,
    "content_json" JSONB NOT NULL,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_contents_pkey" PRIMARY KEY ("locale")
);

-- AddForeignKey
ALTER TABLE "homepage_contents" ADD CONSTRAINT "homepage_contents_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
