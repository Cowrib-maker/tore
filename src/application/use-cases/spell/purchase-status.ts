import type { ActorContext } from "@/application/common/actor-context";
import {
  processQpayInvoicePayment,
  type ProcessQpayPaymentDeps,
} from "@/application/use-cases/billing/process-qpay-payment";
import { BILLING_PROVIDER_QPAY, InvoiceStatus } from "@/domain/enums";
import { NotFoundError } from "@/domain/errors/domain-error";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { SpellAdminDeps } from "./deps";
import { fulfillSpellPurchase, toSpellCheckoutView, type SpellCheckoutView } from "./purchase";

export type SpellPurchaseStatusView = {
  invoice: SpellCheckoutView;
  paid: boolean;
  /** Set once the licence exists (never contains the code). */
  licenseId: string | null;
};

/**
 * Own-purchase status. A non-owner (or a non-Spell invoice) gets the same
 * NotFound as a missing id. A still-pending QPay invoice is verified against
 * QPay here (server-to-server); a PAID invoice is (re)fulfilled idempotently,
 * which heals a fulfilment that failed earlier.
 */
export async function getOwnSpellPurchaseStatus(
  actor: ActorContext,
  invoiceId: string,
  deps: ProcessQpayPaymentDeps & { invoiceRepository: InvoiceRepository },
  spellDeps: SpellAdminDeps | null,
  now: Date = new Date(),
): Promise<SpellPurchaseStatusView> {
  let invoice = await deps.invoiceRepository.findById(invoiceId);
  if (!invoice || invoice.userId !== actor.userId || !invoice.spellPlanCode) {
    throw new NotFoundError("Invoice");
  }

  if (invoice.status === InvoiceStatus.PENDING && invoice.providerInvoiceId && invoice.provider === BILLING_PROVIDER_QPAY) {
    try {
      invoice = (await processQpayInvoicePayment(invoice.providerInvoiceId, deps, now)).invoice;
    } catch (error) {
      if (
        error instanceof PaymentVerificationError &&
        (error.code === "PAYMENT_NOT_SUCCESSFUL" || error.code === "WRONG_AMOUNT" || error.code === "UNPRICED_PLAN")
      ) {
        invoice = (await deps.invoiceRepository.findById(invoice.id)) ?? invoice;
      } else {
        throw error;
      }
    }
  }

  let licenseId: string | null = null;
  if (invoice.status === InvoiceStatus.PAID && spellDeps) {
    try {
      licenseId = (await fulfillSpellPurchase(invoice, spellDeps, now)).licenseId;
    } catch (error) {
      console.error("[spell] licence fulfilment deferred:", error instanceof Error ? error.name : "unknown");
    }
  }
  return { invoice: toSpellCheckoutView(invoice), paid: invoice.status === InvoiceStatus.PAID, licenseId };
}
