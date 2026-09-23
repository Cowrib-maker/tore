import type { ActorContext } from "@/application/common/actor-context";
import { InvoiceStatus, MANUAL_BILLING_PROVIDERS } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { Invoice } from "@/domain/entities/invoice";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";

export type ClaimManualPaymentDeps = {
  invoiceRepository: InvoiceRepository;
};

/**
 * The user's "Төлбөр хийсэн" (I've paid) click. Moves a manual invoice
 * from PENDING to AWAITING_VERIFICATION only — this NEVER activates
 * entitlement (see verify-manual-payment.ts, which requires an admin).
 * Idempotent: calling it again on an already-AWAITING_VERIFICATION or
 * already-PAID invoice is a no-op that returns the current invoice, not
 * an error — a doubled click must never fail loudly for the user.
 */
export async function claimManualPayment(
  actor: ActorContext,
  invoiceId: string,
  deps: ClaimManualPaymentDeps,
  now: Date = new Date(),
): Promise<Invoice> {
  const invoice = await deps.invoiceRepository.findById(invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice", invoiceId);
  }
  if (invoice.userId !== actor.userId) {
    throw new ForbiddenError();
  }
  if (!(MANUAL_BILLING_PROVIDERS as readonly string[]).includes(invoice.provider)) {
    throw new ValidationError("This invoice is not a manual payment.");
  }
  if (invoice.status === InvoiceStatus.AWAITING_VERIFICATION || invoice.status === InvoiceStatus.PAID) {
    return invoice;
  }
  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new ValidationError("This invoice can no longer be claimed as paid.");
  }
  if (invoice.expiresAt.getTime() <= now.getTime()) {
    throw new ValidationError("This invoice has expired.");
  }

  return deps.invoiceRepository.updateStatus(invoice.id, InvoiceStatus.AWAITING_VERIFICATION);
}
