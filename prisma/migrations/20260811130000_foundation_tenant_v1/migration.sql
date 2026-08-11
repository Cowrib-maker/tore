-- EPIC 02 · Sprint 2.2 Wave 1 — Tenant foundation (additive only)
-- ADR-001 · Compatibility charter: no destructive changes
-- Deploy: apply this migration before enabling TORE_FOUNDATION_TENANT_V1
-- or running db:backfill-personal-tenants. App user reads do not require
-- personal_tenant_id (Wave 1 remediation — column is optional until backfill).

DO $$ BEGIN
  CREATE TYPE "TenantKind" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "tenants" (
    "id" TEXT NOT NULL,
    "kind" "TenantKind" NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tenants_kind_status_idx" ON "tenants"("kind", "status");

CREATE INDEX IF NOT EXISTS "tenants_deleted_at_idx" ON "tenants"("deleted_at");

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "personal_tenant_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_personal_tenant_id_key"
  ON "users"("personal_tenant_id");

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_personal_tenant_id_fkey";

ALTER TABLE "users"
  ADD CONSTRAINT "users_personal_tenant_id_fkey"
  FOREIGN KEY ("personal_tenant_id") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
