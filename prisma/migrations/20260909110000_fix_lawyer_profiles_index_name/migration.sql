-- Corrective migration: 20260909100000_lawyer_position recreated the
-- is_listed/verification_status index as a 3-column index (adding
-- position) but kept the old 2-column index name. Prisma's own
-- naming-convention introspection expects the column list to be reflected
-- in the name, so this showed up as spurious schema drift. Rename to
-- match Prisma's default convention — no data or column changes.
ALTER INDEX "lawyer_profiles_is_listed_verification_status_idx" RENAME TO "lawyer_profiles_is_listed_verification_status_position_idx";
