-- TORE Spell user feedback (a signal, never linguistic authority). Additive only: new enums + one new table.
CREATE TYPE "SpellFeedbackType" AS ENUM ('WRONG_CORRECTION', 'MISSING_ERROR', 'WRONG_SUGGESTION', 'MISSING_WORD', 'GENERAL');
CREATE TYPE "SpellFeedbackStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'NEEDS_NATIVE_REVIEW', 'DUPLICATE');

CREATE TABLE "spell_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "feedback_type" "SpellFeedbackType" NOT NULL,
    "token" VARCHAR(40) NOT NULL,
    "engine_suggestion" VARCHAR(40),
    "user_suggestion" VARCHAR(40),
    "comment" VARCHAR(200),
    "reason_code" VARCHAR(40),
    "engine_version" VARCHAR(40) NOT NULL,
    "data_version" VARCHAR(200) NOT NULL,
    "group_key" VARCHAR(64) NOT NULL,
    "status" "SpellFeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "review_reason" VARCHAR(500),

    CONSTRAINT "spell_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spell_feedback_group_key_idx" ON "spell_feedback"("group_key");
CREATE INDEX "spell_feedback_user_id_created_at_idx" ON "spell_feedback"("user_id", "created_at" DESC);
CREATE INDEX "spell_feedback_status_created_at_idx" ON "spell_feedback"("status", "created_at" DESC);
