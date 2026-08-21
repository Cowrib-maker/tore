-- Fact and evidence intake for lawyer-owned case files.
-- Does not add file-upload storage or LegalInfo archive tables.

CREATE TABLE "case_facts" (
    "id" TEXT NOT NULL,
    "case_file_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_reference" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_facts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_facts_case_file_id_created_at_idx"
  ON "case_facts"("case_file_id", "created_at");

ALTER TABLE "case_facts"
  ADD CONSTRAINT "case_facts_case_file_id_fkey"
  FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_evidence" (
    "id" TEXT NOT NULL,
    "case_file_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidence_type" TEXT NOT NULL,
    "file_reference" TEXT,
    "source_reference" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_evidence_case_file_id_created_at_idx"
  ON "case_evidence"("case_file_id", "created_at");

ALTER TABLE "case_evidence"
  ADD CONSTRAINT "case_evidence_case_file_id_fkey"
  FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_fact_evidence" (
    "case_fact_id" TEXT NOT NULL,
    "case_evidence_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_fact_evidence_pkey" PRIMARY KEY ("case_fact_id", "case_evidence_id")
);

CREATE INDEX "case_fact_evidence_case_evidence_id_idx"
  ON "case_fact_evidence"("case_evidence_id");

ALTER TABLE "case_fact_evidence"
  ADD CONSTRAINT "case_fact_evidence_case_fact_id_fkey"
  FOREIGN KEY ("case_fact_id") REFERENCES "case_facts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_fact_evidence"
  ADD CONSTRAINT "case_fact_evidence_case_evidence_id_fkey"
  FOREIGN KEY ("case_evidence_id") REFERENCES "case_evidence"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
