-- EPIC 02 · Sprint 2.3 Wave 1 remediation — membership → user ON DELETE RESTRICT
-- Prevents ACTIVE orgs losing OWNER seats via User hard-delete (O3a integrity).

ALTER TABLE "organization_memberships"
  DROP CONSTRAINT IF EXISTS "organization_memberships_user_id_fkey";

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
