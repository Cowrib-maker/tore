-- QPay-activated billing: PENDING subscription status, invoices, payment transactions.
-- Does not alter LegalInfo / archive / CaseFile tables.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING';

CREATE TYPE "BillingInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "plan_code" "SubscriptionPlanCode" NOT NULL,
    "amount_mnt" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MNT',
    "provider" TEXT NOT NULL,
    "provider_invoice_id" TEXT,
    "status" "BillingInvoiceStatus" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "qr_text" TEXT,
    "qr_image" TEXT,
    "short_url" TEXT,
    "deeplinks_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_provider_invoice_id_key"
  ON "invoices"("provider_invoice_id");
CREATE INDEX "invoices_user_id_status_idx"
  ON "invoices"("user_id", "status");
CREATE INDEX "invoices_status_expires_at_idx"
  ON "invoices"("status", "expires_at");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "amount_mnt" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MNT',
    "status" "BillingPaymentStatus" NOT NULL,
    "paid_at" TIMESTAMP(3),
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_transactions_invoice_id_key"
  ON "payment_transactions"("invoice_id");
CREATE UNIQUE INDEX "payment_transactions_provider_payment_id_key"
  ON "payment_transactions"("provider_payment_id");
CREATE INDEX "payment_transactions_status_idx"
  ON "payment_transactions"("status");

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one ACTIVE SOLO subscription per owner. Sessions are not seats.
CREATE UNIQUE INDEX "subscriptions_one_active_solo_per_owner"
  ON "subscriptions"("owner_user_id")
  WHERE "status" = 'ACTIVE' AND "plan_code" = 'SOLO';
