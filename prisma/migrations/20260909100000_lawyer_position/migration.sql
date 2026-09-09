-- Broaden lawyer registration from attorney-only to general "lawyer/jurist"
-- registration with a chosen position (attorney/prosecutor/judge/other).
-- Existing rows default to ATTORNEY (the only pre-existing registration
-- path), so no marketplace-listed profile changes eligibility on migrate.
-- Only ATTORNEY may ever be listed on the public marketplace — see
-- domain/services/lawyer-eligibility.ts.
CREATE TYPE "LawyerPosition" AS ENUM ('ATTORNEY', 'PROSECUTOR', 'JUDGE', 'OTHER_LAWYER');

ALTER TABLE "lawyer_profiles" ADD COLUMN "position" "LawyerPosition" NOT NULL DEFAULT 'ATTORNEY';

DROP INDEX "lawyer_profiles_is_listed_verification_status_idx";
CREATE INDEX "lawyer_profiles_is_listed_verification_status_idx" ON "lawyer_profiles"("is_listed", "verification_status", "position");
