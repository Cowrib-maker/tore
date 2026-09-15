-- CreateEnum
CREATE TYPE "CaseFactEvidenceRelation" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'RELATES_TO');

-- CreateEnum
CREATE TYPE "CaseAiAnalysisStatus" AS ENUM ('PENDING', 'OK', 'FAILED');

-- CreateEnum
CREATE TYPE "CaseAiCitationType" AS ENUM ('VERIFIED_LEGAL_SOURCE', 'USER_DOCUMENT');

-- CreateEnum
CREATE TYPE "CaseTimelineConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "CaseDraftType" AS ENUM ('LAWYER_POSITION', 'PROSECUTOR_CONCLUSION_STRUCTURE', 'COURT_QUESTIONS');

-- CreateEnum
CREATE TYPE "CaseDraftStatus" AS ENUM ('PENDING', 'OK', 'FAILED');

-- AlterTable
ALTER TABLE "case_evidence" ADD COLUMN     "extract_status" "AIDocumentExtractStatus",
ADD COLUMN     "extracted_text" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "page_count" INTEGER;

-- AlterTable
ALTER TABLE "case_fact_evidence" ADD COLUMN     "relation_type" "CaseFactEvidenceRelation" NOT NULL DEFAULT 'RELATES_TO';

-- CreateTable
CREATE TABLE "case_ai_analyses" (
    "id" TEXT NOT NULL,
    "case_file_id" TEXT NOT NULL,
    "status" "CaseAiAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "sections" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "failure_reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_ai_citations" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "citation_type" "CaseAiCitationType" NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "excerpt" TEXT,
    "source_url" TEXT,
    "source_type" TEXT,
    "document_id" TEXT,
    "document_version_id" TEXT,
    "node_id" TEXT,
    "case_evidence_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_ai_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_timeline_entries" (
    "id" TEXT NOT NULL,
    "case_file_id" TEXT NOT NULL,
    "case_evidence_id" TEXT NOT NULL,
    "raw_date_text" TEXT NOT NULL,
    "parsed_date" TIMESTAMP(3),
    "event_text" TEXT NOT NULL,
    "source_excerpt" TEXT NOT NULL,
    "confidence" "CaseTimelineConfidence" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_drafts" (
    "id" TEXT NOT NULL,
    "case_file_id" TEXT NOT NULL,
    "draft_type" "CaseDraftType" NOT NULL,
    "status" "CaseDraftStatus" NOT NULL DEFAULT 'PENDING',
    "content" JSONB,
    "failure_reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_ai_analyses_case_file_id_created_at_idx" ON "case_ai_analyses"("case_file_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "case_ai_citations_analysis_id_idx" ON "case_ai_citations"("analysis_id");

-- CreateIndex
CREATE INDEX "case_ai_citations_case_evidence_id_idx" ON "case_ai_citations"("case_evidence_id");

-- CreateIndex
CREATE INDEX "case_timeline_entries_case_file_id_parsed_date_idx" ON "case_timeline_entries"("case_file_id", "parsed_date");

-- CreateIndex
CREATE INDEX "case_drafts_case_file_id_created_at_idx" ON "case_drafts"("case_file_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "case_evidence_case_file_id_extract_status_idx" ON "case_evidence"("case_file_id", "extract_status");

-- AddForeignKey
ALTER TABLE "case_ai_analyses" ADD CONSTRAINT "case_ai_analyses_case_file_id_fkey" FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_ai_citations" ADD CONSTRAINT "case_ai_citations_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "case_ai_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_ai_citations" ADD CONSTRAINT "case_ai_citations_case_evidence_id_fkey" FOREIGN KEY ("case_evidence_id") REFERENCES "case_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_timeline_entries" ADD CONSTRAINT "case_timeline_entries_case_file_id_fkey" FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_timeline_entries" ADD CONSTRAINT "case_timeline_entries_case_evidence_id_fkey" FOREIGN KEY ("case_evidence_id") REFERENCES "case_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_drafts" ADD CONSTRAINT "case_drafts_case_file_id_fkey" FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

