import type { ActorContext } from "@/application/common/actor-context";
import type { Invoice } from "@/domain/entities/invoice";
import { InvoiceStatus, MANUAL_BILLING_PROVIDERS, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";

export type RejectManualPaymentDeps = {
  invoiceRepository: InvoiceRepository;
};

/**
 * Admin rejects a manual payment claim (no matching transfer found, wrong
 * amount, etc). AWAITING_VERIFICATION → FAILED, recording who rejected it
 * and why. Never touches Subscription/entitlement — there is nothing to
 * undo, since claimManualPayment never activates anything.
 */
export async function rejectManualPayment(
  actor: ActorContext,
  invoiceId: string,
  reason: string,
  deps: RejectManualPaymentDeps,
  now: Date = new Date(),
): Promise<Invoice> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new ValidationError("A rejection reason is required.");
  }

  const invoice = await deps.invoiceRepository.findById(invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice", invoiceId);
  }
  if (!(MANUAL_BILLING_PROVIDERS as readonly string[]).includes(invoice.provider)) {
    throw new ValidationError("This invoice is not a manual payment.");
  }
  if (invoice.status === InvoiceStatus.FAILED) {
    return invoice;
  }
  if (invoice.status !== InvoiceStatus.AWAITING_VERIFICATION) {
    throw new ValidationError("Only a payment awaiting verification can be rejected.");
  }

  return deps.invoiceRepository.recordManualVerification(invoice.id, {
    status: InvoiceStatus.FAILED,
    verifiedByUserId: actor.userId,
    verifiedAt: now,
    rejectionReason: trimmedReason,
  });
}
