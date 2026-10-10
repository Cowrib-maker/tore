-- Admin-editable public text with draft / publish / revision history. Additive only.
CREATE TABLE "site_content_entries" (
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "draft_value" TEXT,
    "published_value" TEXT,
    "published_revision" INTEGER,
    "revision_counter" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_user_id" TEXT,
    "updated_by_label" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_user_id" TEXT,
    "published_by_label" TEXT,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "site_content_entries_pkey" PRIMARY KEY ("key","locale")
);

CREATE TABLE "site_content_revisions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_by_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_content_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_content_revisions_key_locale_revision_key" ON "site_content_revisions"("key", "locale", "revision");
CREATE INDEX "site_content_revisions_key_locale_created_at_idx" ON "site_content_revisions"("key", "locale", "created_at" DESC);
