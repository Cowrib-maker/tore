-- Fix production schema drift: the manual (bank transfer / printed QR)
-- payment verification schema (AWAITING_VERIFICATION status + the invoice
-- verification audit columns) was added to schema.prisma but no migration
-- was ever generated for it, so it was never applied outside whichever
-- database had `prisma db push` run against it directly. Purely additive
-- and idempotent (IF NOT EXISTS everywhere) — safe to run against a
-- database that already has some or all of these already.

ALTER TYPE "BillingInvoiceStatus" ADD VALUE IF NOT EXISTS 'AWAITING_VERIFICATION';

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "verified_by_user_id" TEXT;

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
