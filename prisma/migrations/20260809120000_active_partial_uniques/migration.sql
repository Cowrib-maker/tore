-- Soft-delete-safe uniqueness: active rows only.
-- Allows re-using email/slug after soft-delete without colliding with tombstoned rows.

DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_email_active_unique" ON "users"("email") WHERE "deleted_at" IS NULL;

DROP INDEX IF EXISTS "lawyer_profiles_slug_key";
CREATE UNIQUE INDEX "lawyer_profiles_slug_active_unique" ON "lawyer_profiles"("slug") WHERE "deleted_at" IS NULL;
