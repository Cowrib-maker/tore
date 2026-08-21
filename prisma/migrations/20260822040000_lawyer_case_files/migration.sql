-- Lawyer-owned case files: persist request/mappings/review snapshots.
-- Does not duplicate LegalInfo articles or archive blobs.

CREATE TABLE "case_files" (
    "id" TEXT NOT NULL,
    "owner_lawyer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "legal_domain" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "applicable_at" TEXT NOT NULL,
    "request_json" JSONB NOT NULL,
    "review_json" JSONB,
    "mapping_log_json" JSONB NOT NULL,
    "fixture_rules_json" JSONB,
    "analysis_status" TEXT NOT NULL DEFAULT 'NOT_ANALYZED',
    "last_analyzed_at" TIMESTAMP(3),
    "last_analysis_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_files_owner_lawyer_id_updated_at_idx"
  ON "case_files"("owner_lawyer_id", "updated_at" DESC);

ALTER TABLE "case_files"
  ADD CONSTRAINT "case_files_owner_lawyer_id_fkey"
  FOREIGN KEY ("owner_lawyer_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
