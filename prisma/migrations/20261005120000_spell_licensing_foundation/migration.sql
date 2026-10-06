-- TORE Spell licensing foundation (Phase 1).
--
-- Purely additive: creates new enums/tables/indexes and one FK from the new
-- spell_licenses.owner_user_id to users(id). No existing table is altered and
-- no existing data is touched, so the migration is safe to apply to a live
-- database and trivially reversible (see the rollback notes at the bottom).
--
-- The Prisma-generated DDL comes first; the "raw SQL" section after it holds
-- objects Prisma's schema DSL cannot express. Do not let a future
-- `prisma migrate dev` drop them as drift.

-- CreateEnum
CREATE TYPE "SpellProduct" AS ENUM ('TORE_SPELL');

-- CreateEnum
CREATE TYPE "SpellPlanCode" AS ENUM ('SPELL_1M', 'SPELL_3M', 'SPELL_6M', 'SPELL_12M');

-- CreateEnum
CREATE TYPE "SpellLicenseSource" AS ENUM ('ADMIN_ISSUED', 'PURCHASE', 'PROMO');

-- CreateEnum
CREATE TYPE "SpellLicenseStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "SpellActivationStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SpellActivationEndReason" AS ENUM ('TRANSFERRED', 'USER_DEACTIVATED', 'ADMIN_DEACTIVATED', 'LICENSE_REVOKED', 'INSTALLATION_REVOKED');

-- CreateEnum
CREATE TYPE "SpellPlatform" AS ENUM ('WINDOWS', 'MACOS');

-- CreateEnum
CREATE TYPE "SpellEventType" AS ENUM ('LICENSE_ISSUED', 'LICENSE_REVOKED', 'LICENSE_CODE_REVEALED', 'LICENSE_FIRST_ACTIVATED', 'ACTIVATION_CREATED', 'ACTIVATION_TRANSFERRED', 'ACTIVATION_DEACTIVATED', 'ACTIVATION_REVOKED', 'TRANSFER_COOLDOWN_OVERRIDDEN');

-- CreateEnum
CREATE TYPE "SpellActorType" AS ENUM ('SYSTEM', 'USER', 'ADMIN', 'DEVICE');

-- CreateEnum
CREATE TYPE "SpellAttemptKind" AS ENUM ('ACTIVATE', 'VALIDATE', 'DEACTIVATE');

-- CreateEnum
CREATE TYPE "SpellAttemptOutcome" AS ENUM ('SUCCESS', 'INVALID_CODE', 'SIGNATURE_INVALID', 'STALE_TIMESTAMP', 'REPLAY', 'LICENSE_REJECTED', 'TRANSFER_BLOCKED', 'ACTIVATION_REJECTED', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "spell_licenses" (
    "id" TEXT NOT NULL,
    "product" "SpellProduct" NOT NULL DEFAULT 'TORE_SPELL',
    "plan_code" "SpellPlanCode" NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "source" "SpellLicenseSource" NOT NULL,
    "status" "SpellLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "owner_user_id" TEXT,
    "code_hash" TEXT NOT NULL,
    "code_hash_key_id" TEXT NOT NULL,
    "code_ciphertext" BYTEA NOT NULL,
    "code_enc_key_version" TEXT NOT NULL,
    "code_hint" TEXT NOT NULL,
    "redeem_by" TIMESTAMP(3) NOT NULL,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "last_device_change_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" VARCHAR(500),
    "issued_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spell_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spell_installations" (
    "id" TEXT NOT NULL,
    "key_thumbprint" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "platform" "SpellPlatform" NOT NULL,
    "app_version" VARCHAR(32) NOT NULL,
    "machine_hint_hash" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "spell_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spell_activations" (
    "id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" "SpellActivationStatus" NOT NULL DEFAULT 'ACTIVE',
    "end_reason" "SpellActivationEndReason",
    "activated_at" TIMESTAMP(3) NOT NULL,
    "last_validated_at" TIMESTAMP(3) NOT NULL,
    "deactivated_at" TIMESTAMP(3),
    "superseded_by_activation_id" TEXT,
    "transferred_from_activation_id" TEXT,
    "last_token_jti" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spell_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spell_license_events" (
    "id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "activation_id" TEXT,
    "type" "SpellEventType" NOT NULL,
    "actor_type" "SpellActorType" NOT NULL,
    "actor_user_id" TEXT,
    "ip_hash" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spell_license_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spell_attempts" (
    "id" TEXT NOT NULL,
    "kind" "SpellAttemptKind" NOT NULL,
    "outcome" "SpellAttemptOutcome" NOT NULL,
    "ip_hash" TEXT,
    "installation_thumbprint" TEXT,
    "license_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spell_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spell_request_nonces" (
    "installation_thumbprint" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spell_request_nonces_pkey" PRIMARY KEY ("installation_thumbprint","nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "spell_licenses_code_hash_key" ON "spell_licenses"("code_hash");

-- CreateIndex
CREATE INDEX "spell_licenses_owner_user_id_status_idx" ON "spell_licenses"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "spell_licenses_status_expires_at_idx" ON "spell_licenses"("status", "expires_at");

-- CreateIndex
CREATE INDEX "spell_licenses_created_at_idx" ON "spell_licenses"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "spell_installations_key_thumbprint_key" ON "spell_installations"("key_thumbprint");

-- CreateIndex
CREATE INDEX "spell_activations_license_id_status_idx" ON "spell_activations"("license_id", "status");

-- CreateIndex
CREATE INDEX "spell_activations_installation_id_status_idx" ON "spell_activations"("installation_id", "status");

-- CreateIndex
CREATE INDEX "spell_activations_license_id_activated_at_idx" ON "spell_activations"("license_id", "activated_at" DESC);

-- CreateIndex
CREATE INDEX "spell_license_events_license_id_created_at_idx" ON "spell_license_events"("license_id", "created_at");

-- CreateIndex
CREATE INDEX "spell_license_events_created_at_idx" ON "spell_license_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "spell_attempts_ip_hash_created_at_idx" ON "spell_attempts"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "spell_attempts_installation_thumbprint_created_at_idx" ON "spell_attempts"("installation_thumbprint", "created_at");

-- CreateIndex
CREATE INDEX "spell_attempts_created_at_idx" ON "spell_attempts"("created_at");

-- CreateIndex
CREATE INDEX "spell_request_nonces_expires_at_idx" ON "spell_request_nonces"("expires_at");

-- AddForeignKey
ALTER TABLE "spell_licenses" ADD CONSTRAINT "spell_licenses_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spell_activations" ADD CONSTRAINT "spell_activations_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "spell_licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spell_activations" ADD CONSTRAINT "spell_activations_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "spell_installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spell_license_events" ADD CONSTRAINT "spell_license_events_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "spell_licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Raw SQL: integrity guarantees Prisma cannot express ─────────────────────

-- DATABASE-LEVEL BACKSTOP: a license can have at most one ACTIVE activation,
-- no matter how many concurrent requests race, and regardless of any
-- application bug. Application code runs SERIALIZABLE and retries, but this
-- index is what makes "two ACTIVE activations" physically impossible.
CREATE UNIQUE INDEX "spell_activations_one_active_per_license"
  ON "spell_activations"("license_id")
  WHERE "status" = 'ACTIVE';

-- spell_licenses invariants
ALTER TABLE "spell_licenses"
  ADD CONSTRAINT "spell_licenses_term_pair_chk"
    CHECK (("starts_at" IS NULL) = ("expires_at" IS NULL)),
  ADD CONSTRAINT "spell_licenses_term_order_chk"
    CHECK ("starts_at" IS NULL OR "expires_at" > "starts_at"),
  ADD CONSTRAINT "spell_licenses_duration_chk"
    CHECK ("duration_months" > 0),
  ADD CONSTRAINT "spell_licenses_revoked_chk"
    CHECK (("status" = 'REVOKED') = ("revoked_at" IS NOT NULL)),
  ADD CONSTRAINT "spell_licenses_code_hint_chk"
    CHECK (char_length("code_hint") = 4);

-- spell_activations invariants: an ACTIVE row has no end data; an ended row
-- always has an end time and a reason consistent with its status.
ALTER TABLE "spell_activations"
  ADD CONSTRAINT "spell_activations_end_state_chk"
    CHECK (
      ("status" = 'ACTIVE' AND "deactivated_at" IS NULL AND "end_reason" IS NULL)
      OR
      ("status" = 'DEACTIVATED' AND "deactivated_at" IS NOT NULL
        AND "end_reason" IN ('TRANSFERRED', 'USER_DEACTIVATED', 'ADMIN_DEACTIVATED'))
      OR
      ("status" = 'REVOKED' AND "deactivated_at" IS NOT NULL
        AND "end_reason" IN ('LICENSE_REVOKED', 'INSTALLATION_REVOKED'))
    );

-- spell_license_events is an immutable audit trail: reject UPDATE, DELETE and
-- TRUNCATE at the database level so even a buggy or compromised application
-- path cannot rewrite history. (A superuser can still drop the trigger; that
-- is an operational control, not an application one.)
CREATE FUNCTION "spell_license_events_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'spell_license_events is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "spell_license_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "spell_license_events"
  FOR EACH ROW EXECUTE FUNCTION "spell_license_events_immutable"();

CREATE TRIGGER "spell_license_events_no_truncate"
  BEFORE TRUNCATE ON "spell_license_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "spell_license_events_immutable"();

-- Rollback (manual, only before any Spell data matters):
--   DROP TABLE spell_request_nonces, spell_attempts, spell_license_events,
--     spell_activations, spell_installations, spell_licenses;
--   DROP FUNCTION spell_license_events_immutable();
--   DROP TYPE "SpellProduct", "SpellPlanCode", "SpellLicenseSource",
--     "SpellLicenseStatus", "SpellActivationStatus", "SpellActivationEndReason",
--     "SpellPlatform", "SpellEventType", "SpellActorType", "SpellAttemptKind",
--     "SpellAttemptOutcome";
