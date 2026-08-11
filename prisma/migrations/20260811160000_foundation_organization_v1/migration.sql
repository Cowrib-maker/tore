-- EPIC 02 · Sprint 2.3 Wave 1 — Organization foundation (additive only)
-- ADR-003 · ADR-004 · Blueprint locks: no slug; tenant FK ON DELETE RESTRICT
-- Deploy: apply before enabling TORE_FOUNDATION_ORGS_V1

DO $$ BEGIN
  CREATE TYPE "OrganizationType" AS ENUM ('LAW_FIRM', 'LEGAL_ENTITY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrganizationMembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'REVOKED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "tenant_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_tenant_id_key"
  ON "organizations"("tenant_id");

CREATE INDEX IF NOT EXISTS "organizations_type_status_idx"
  ON "organizations"("type", "status");

CREATE INDEX IF NOT EXISTS "organizations_deleted_at_idx"
  ON "organizations"("deleted_at");

ALTER TABLE "organizations"
  DROP CONSTRAINT IF EXISTS "organizations_tenant_id_fkey";

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "organization_memberships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_role" "OrganizationRole" NOT NULL,
    "status" "OrganizationMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_memberships_organization_id_user_id_key"
  ON "organization_memberships"("organization_id", "user_id");

CREATE INDEX IF NOT EXISTS "organization_memberships_user_id_idx"
  ON "organization_memberships"("user_id");

CREATE INDEX IF NOT EXISTS "organization_memberships_organization_id_status_idx"
  ON "organization_memberships"("organization_id", "status");

ALTER TABLE "organization_memberships"
  DROP CONSTRAINT IF EXISTS "organization_memberships_organization_id_fkey";

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_memberships"
  DROP CONSTRAINT IF EXISTS "organization_memberships_user_id_fkey";

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
