-- Additive contact phone for public lawyer directory (nullable, backward compatible).
ALTER TABLE "lawyer_profiles"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;
