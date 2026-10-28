-- TORE Spell purchase flow. Purely additive: two nullable columns and one
-- unique index. No existing row or constraint is changed.
--
-- invoices.spell_plan_code      : set only for TORE Spell licence invoices.
-- spell_licenses.purchase_invoice_id : the paying invoice (UNIQUE) — makes
--   licence issuance idempotent per payment (repeated QPay callbacks or
--   status polls can never mint a second licence).
--
-- Rollback (only if no purchase has happened yet):
--   DROP INDEX "spell_licenses_purchase_invoice_id_key";
--   ALTER TABLE "spell_licenses" DROP COLUMN "purchase_invoice_id";
--   ALTER TABLE "invoices" DROP COLUMN "spell_plan_code";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "spell_plan_code" "SpellPlanCode";

-- AlterTable
ALTER TABLE "spell_licenses" ADD COLUMN "purchase_invoice_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "spell_licenses_purchase_invoice_id_key" ON "spell_licenses"("purchase_invoice_id");
