-- TORE Student lawyer-selection examination preparation. Additive only: new enums and tables, no change to existing data.
-- CreateEnum
CREATE TYPE "StudentExamArea" AS ENUM ('CRIMINAL', 'CIVIL', 'ADMINISTRATIVE', 'CONSTITUTIONAL');

-- CreateEnum
CREATE TYPE "StudentExamReviewStatus" AS ENUM ('IMPORTED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StudentExamAttemptMode" AS ENUM ('STUDY', 'EXAM');

-- CreateEnum
CREATE TYPE "StudentExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "student_exam_problems" (
    "id" TEXT NOT NULL,
    "source_key" VARCHAR(64) NOT NULL,
    "area" "StudentExamArea" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "ordinal_label" VARCHAR(80) NOT NULL,
    "statement" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "topic" VARCHAR(120),
    "difficulty" INTEGER,
    "source_file" VARCHAR(200) NOT NULL,
    "source_locator" JSONB NOT NULL,
    "statement_hash" VARCHAR(64) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "review_status" "StudentExamReviewStatus" NOT NULL DEFAULT 'IMPORTED',
    "review_flags" TEXT[],
    "review_note" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_exam_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_exam_problem_keys" (
    "problem_id" TEXT NOT NULL,
    "model_answer" TEXT,
    "answer_outline" JSONB NOT NULL,
    "legal_provisions" JSONB NOT NULL,
    "court_citations" JSONB NOT NULL,
    "rubric" JSONB NOT NULL,
    "provenance" VARCHAR(40) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_exam_problem_keys_pkey" PRIMARY KEY ("problem_id")
);

-- CreateTable
CREATE TABLE "student_exam_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "StudentExamAttemptMode" NOT NULL,
    "status" "StudentExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "config" JSONB,
    "study_problem_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "finalized_at" TIMESTAMP(3),
    "score_total" DECIMAL(6,2),
    "score_max" INTEGER,

    CONSTRAINT "student_exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_exam_attempt_items" (
    "attempt_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "answer_text" TEXT NOT NULL DEFAULT '',
    "method_checks" INTEGER[],
    "answer_updated_at" TIMESTAMP(3),
    "self_ratings" JSONB,
    "score_awarded" DECIMAL(6,2),
    "score_max" INTEGER,
    "auto_indicators" JSONB,

    CONSTRAINT "student_exam_attempt_items_pkey" PRIMARY KEY ("attempt_id","problem_id")
);

-- CreateTable
CREATE TABLE "student_court_decisions" (
    "id" TEXT NOT NULL,
    "source_key" VARCHAR(64) NOT NULL,
    "area" "StudentExamArea" NOT NULL,
    "chapter" INTEGER,
    "court_date" VARCHAR(80),
    "case_number" VARCHAR(80),
    "topic" TEXT NOT NULL,
    "page_from" INTEGER,
    "page_to" INTEGER,
    "source_file" VARCHAR(200) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_court_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_exam_problems_source_key_key" ON "student_exam_problems"("source_key");

-- CreateIndex
CREATE INDEX "student_exam_problems_area_review_status_idx" ON "student_exam_problems"("area", "review_status");

-- CreateIndex
CREATE INDEX "student_exam_problems_statement_hash_idx" ON "student_exam_problems"("statement_hash");

-- CreateIndex
CREATE INDEX "student_exam_attempts_user_id_status_idx" ON "student_exam_attempts"("user_id", "status");

-- CreateIndex
CREATE INDEX "student_exam_attempts_user_id_started_at_idx" ON "student_exam_attempts"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "student_exam_attempt_items_problem_id_idx" ON "student_exam_attempt_items"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_court_decisions_source_key_key" ON "student_court_decisions"("source_key");

-- CreateIndex
CREATE INDEX "student_court_decisions_area_chapter_idx" ON "student_court_decisions"("area", "chapter");

-- AddForeignKey
ALTER TABLE "student_exam_problem_keys" ADD CONSTRAINT "student_exam_problem_keys_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "student_exam_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exam_attempts" ADD CONSTRAINT "student_exam_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exam_attempt_items" ADD CONSTRAINT "student_exam_attempt_items_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "student_exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exam_attempt_items" ADD CONSTRAINT "student_exam_attempt_items_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "student_exam_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariants Prisma cannot express.
-- One timed exam in progress per student (an interrupted exam is resumed, never duplicated).
CREATE UNIQUE INDEX "student_exam_attempts_one_active_exam_idx" ON "student_exam_attempts"("user_id") WHERE "mode" = 'EXAM' AND "status" = 'IN_PROGRESS';
-- One study attempt in progress per student and problem.
CREATE UNIQUE INDEX "student_exam_attempts_one_active_study_idx" ON "student_exam_attempts"("user_id", "study_problem_id") WHERE "mode" = 'STUDY' AND "status" = 'IN_PROGRESS';
ALTER TABLE "student_exam_problems" ADD CONSTRAINT "student_exam_problems_difficulty_range" CHECK ("difficulty" IS NULL OR "difficulty" BETWEEN 1 AND 5);
ALTER TABLE "student_exam_attempts" ADD CONSTRAINT "student_exam_attempts_score_range" CHECK ("score_total" IS NULL OR ("score_max" IS NOT NULL AND "score_total" BETWEEN 0 AND "score_max"));
ALTER TABLE "student_exam_attempts" ADD CONSTRAINT "student_exam_attempts_mode_shape" CHECK (("mode" = 'EXAM' AND "deadline_at" IS NOT NULL) OR ("mode" = 'STUDY' AND "study_problem_id" IS NOT NULL));
