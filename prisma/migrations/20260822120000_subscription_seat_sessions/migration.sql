-- Lawyer subscription seats, device sessions, and monthly entitlement usage.
-- Session tracking is an entitlement/security layer; QPay remains the payment adapter.

CREATE TYPE "SubscriptionPlanCode" AS ENUM ('SOLO', 'TEAM');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "SeatStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "DeviceSessionStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "plan_code" "SubscriptionPlanCode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "seat_limit" INTEGER NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "provider_invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_owner_user_id_status_idx"
  ON "subscriptions"("owner_user_id", "status");
CREATE INDEX "subscriptions_status_current_period_end_idx"
  ON "subscriptions"("status", "current_period_end");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "subscription_seats" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "subscription_seats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_seats_subscription_id_user_id_key"
  ON "subscription_seats"("subscription_id", "user_id");
CREATE INDEX "subscription_seats_user_id_status_idx"
  ON "subscription_seats"("user_id", "status");
CREATE INDEX "subscription_seats_subscription_id_status_idx"
  ON "subscription_seats"("subscription_id", "status");

ALTER TABLE "subscription_seats"
  ADD CONSTRAINT "subscription_seats_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_seats"
  ADD CONSTRAINT "subscription_seats_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "device_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "user_agent" VARCHAR(256),
    "ip_hash" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "status" "DeviceSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "request_count_window_start" TIMESTAMP(3),
    "request_count_in_window" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_sessions_user_id_status_idx"
  ON "device_sessions"("user_id", "status");
CREATE INDEX "device_sessions_subscription_id_status_idx"
  ON "device_sessions"("subscription_id", "status");
CREATE INDEX "device_sessions_status_last_seen_at_idx"
  ON "device_sessions"("status", "last_seen_at");
CREATE INDEX "device_sessions_user_id_last_seen_at_idx"
  ON "device_sessions"("user_id", "last_seen_at");

ALTER TABLE "device_sessions"
  ADD CONSTRAINT "device_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_sessions"
  ADD CONSTRAINT "device_sessions_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "entitlement_usages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "period_start" DATE NOT NULL,
    "case_analysis_count" INTEGER NOT NULL DEFAULT 0,
    "document_analysis_count" INTEGER NOT NULL DEFAULT 0,
    "legal_ai_query_count" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entitlement_usages_user_id_period_start_key"
  ON "entitlement_usages"("user_id", "period_start");
CREATE INDEX "entitlement_usages_subscription_id_period_start_idx"
  ON "entitlement_usages"("subscription_id", "period_start");

ALTER TABLE "entitlement_usages"
  ADD CONSTRAINT "entitlement_usages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entitlement_usages"
  ADD CONSTRAINT "entitlement_usages_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
