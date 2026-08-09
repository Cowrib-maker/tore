-- Sprint 4: marketplace discovery + offerings modality + location
CREATE TYPE "ConsultationModality" AS ENUM ('ONLINE', 'IN_PERSON');

ALTER TABLE "lawyer_profiles"
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "education" TEXT;

ALTER TABLE "consultation_offerings"
  ADD COLUMN IF NOT EXISTS "modality" "ConsultationModality" NOT NULL DEFAULT 'ONLINE';

CREATE INDEX IF NOT EXISTS "lawyer_profiles_city_idx" ON "lawyer_profiles"("city");
