-- Citizen plans, guest sessions, and persisted legal-question thread state.

ALTER TYPE "SubscriptionPlanCode" ADD VALUE IF NOT EXISTS 'CITIZEN_BASIC';
ALTER TYPE "SubscriptionPlanCode" ADD VALUE IF NOT EXISTS 'CITIZEN_PLUS';

CREATE TYPE "LegalQuestionStatus" AS ENUM ('NEW', 'CLARIFYING', 'ANSWERED');

CREATE TABLE "guest_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "free_legal_questions_used" INTEGER NOT NULL DEFAULT 0,
    "claimed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_sessions_token_hash_key" ON "guest_sessions"("token_hash");
CREATE INDEX "guest_sessions_expires_at_idx" ON "guest_sessions"("expires_at");

ALTER TABLE "guest_sessions"
  ADD CONSTRAINT "guest_sessions_claimed_by_user_id_fkey"
  FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_conversations" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "ai_conversations"
  ADD COLUMN "guest_session_id" TEXT,
  ADD COLUMN "question_status" "LegalQuestionStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "billed_question_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ai_conversations_guest_session_id_updated_at_idx"
  ON "ai_conversations"("guest_session_id", "updated_at" DESC);

ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_guest_session_id_fkey"
  FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "subscriptions_one_active_citizen_basic_per_owner"
  ON "subscriptions"("owner_user_id")
  WHERE "status" = 'ACTIVE' AND "plan_code" = 'CITIZEN_BASIC';

CREATE UNIQUE INDEX "subscriptions_one_active_citizen_plus_per_owner"
  ON "subscriptions"("owner_user_id")
  WHERE "status" = 'ACTIVE' AND "plan_code" = 'CITIZEN_PLUS';
