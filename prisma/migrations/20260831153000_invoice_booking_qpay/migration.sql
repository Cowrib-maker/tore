-- Consultation QPay invoices: optional booking link, plan_code only for subscriptions.
ALTER TABLE "invoices" ADD COLUMN "booking_id" TEXT;
ALTER TABLE "invoices" ALTER COLUMN "plan_code" DROP NOT NULL;

CREATE UNIQUE INDEX "invoices_booking_id_key" ON "invoices"("booking_id");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
