-- Short (4-digit) customer-facing "Гүйлгээний утга" for manual (bank
-- transfer / printed QR) payments only. Never the canonical invoice
-- identity (that's still `id`) and never a replacement for
-- provider_invoice_id (unchanged, still the deterministic TORE-xxxxxxxx
-- reference QPay/admin tooling relies on).
--
-- Not globally unique: only 10,000 possible 4-digit values exist, and the
-- product needs to reuse them once an invoice leaves PENDING /
-- AWAITING_VERIFICATION. A plain UNIQUE column would permanently exhaust
-- the whole code space. Instead:
--   - a plain (non-unique) index supports admin lookup/display queries
--     across all invoices regardless of status;
--   - a PARTIAL unique index enforces, at the database level, that no two
--     invoices can simultaneously hold the same code while both are
--     PENDING/AWAITING_VERIFICATION — this is what actually makes
--     concurrent manual-checkout requests safe: two racing inserts for the
--     same generated code cannot both succeed, so the losing request's
--     application code retries with a freshly generated one. An
--     application-level "check active codes, then insert" alone cannot
--     give this guarantee under real concurrency.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_code" TEXT;

CREATE INDEX IF NOT EXISTS "invoices_payment_code_idx" ON "invoices"("payment_code");

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_payment_code_active_key"
  ON "invoices"("payment_code")
  WHERE "status" IN ('PENDING', 'AWAITING_VERIFICATION');
