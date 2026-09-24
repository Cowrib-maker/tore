import type { ActorContext } from "@/application/common/actor-context";
import {
  processQpayInvoicePayment,
  type ProcessQpayPaymentDeps,
  type ProcessQpayPaymentResult,
} from "@/application/use-cases/billing/process-qpay-payment";
import { BILLING_PROVIDER_QPAY, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";

export type VerifyAdminQpayInvoiceDeps = ProcessQpayPaymentDeps & {
  invoiceRepository: InvoiceRepository;
};

/**
 * "QPay-р шалгах" — an admin manually re-triggers the REAL server-side
 * QPay payment/check for a stuck or PENDING QPay invoice (e.g. the
 * callback never arrived). This is the exact same verification path as
 * the QPay callback route ({@link processQpayInvoicePayment}) — never a
 * second, weaker verification routine, and never a manual "mark as paid".
 * The invoice only becomes PAID if QPay itself reports a matching,
 * catalog-priced payment.
 */
export async function verifyAdminQpayInvoiceUseCase(
  actor: ActorContext,
  invoiceId: string,
  deps: VerifyAdminQpayInvoiceDeps,
  now: Date = new Date(),
): Promise<ProcessQpayPaymentResult> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const invoice = await deps.invoiceRepository.findById(invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice", invoiceId);
  }
  if (invoice.provider !== BILLING_PROVIDER_QPAY) {
    throw new ValidationError("This invoice was not created through QPay.");
  }
  if (!invoice.providerInvoiceId) {
    throw new ValidationError("This invoice has no QPay invoice reference.");
  }

  return processQpayInvoicePayment(invoice.providerInvoiceId, deps, now);
}
