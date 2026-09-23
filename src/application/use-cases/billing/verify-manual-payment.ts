import type { ActorContext } from "@/application/common/actor-context";
import { activateOrRenewPaidSubscription } from "@/application/use-cases/billing/activate-subscription";
import type { Invoice } from "@/domain/entities/invoice";
import type { Subscription } from "@/domain/entities/subscription";
import {
  InvoiceStatus,
  MANUAL_BILLING_PROVIDERS,
  PaymentTransactionStatus,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { BillingUnitOfWork } from "@/domain/ports/billing-unit-of-work";
import { DuplicatePaymentError } from "@/domain/repositories/invoice-repository";

export type VerifyManualPaymentDeps = {
  billingUnitOfWork: BillingUnitOfWork;
};

export type VerifyManualPaymentResult = {
  alreadyProcessed: boolean;
  invoice: Invoice;
  subscription: Subscription | null;
};

function assertAdmin(actor: ActorContext): void {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
}

function assertManualInvoice(invoice: Invoice): void {
  if (!(MANUAL_BILLING_PROVIDERS as readonly string[]).includes(invoice.provider)) {
    throw new ValidationError("This invoice is not a manual payment.");
  }
}

/**
 * Admin approves a manual (bank transfer / printed QR) payment claim.
 * AWAITING_VERIFICATION → PAID, records verifiedByUserId/verifiedAt,
 * creates the PaymentTransaction, and activates entitlement through the
 * SAME shared path QPay uses (activateOrRenewPaidSubscription) — never a
 * second activation routine. Runs entirely inside one billing
 * transaction so a payment can never end up PAID without the
 * entitlement it paid for, or vice versa.
 *
 * Idempotent: verifying an already-PAID invoice returns the existing
 * result rather than creating a duplicate PaymentTransaction or
 * double-activating the subscription — protects against a double
 * admin click racing itself.
 */
export async function verifyManualPayment(
  actor: ActorContext,
  invoiceId: string,
  deps: VerifyManualPaymentDeps,
  now: Date = new Date(),
): Promise<VerifyManualPaymentResult> {
  assertAdmin(actor);

  return deps.billingUnitOfWork.runInTransaction(async (repos) => {
    const invoice = await repos.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError("Invoice", invoiceId);
    }
    assertManualInvoice(invoice);

    const existingPayment = await repos.paymentTransactionRepository.findByInvoiceId(invoice.id);
    if (invoice.status === InvoiceStatus.PAID && existingPayment?.status === PaymentTransactionStatus.PAID) {
      const subscription = invoice.planCode
        ? invoice.subscriptionId
          ? await repos.subscriptionRepository.findById(invoice.subscriptionId)
          : await repos.subscriptionRepository.findLatestOwnedByUserId(invoice.userId, invoice.planCode)
        : null;
      return { alreadyProcessed: true, invoice, subscription };
    }

    if (invoice.status !== InvoiceStatus.AWAITING_VERIFICATION) {
      throw new ValidationError(
        "Only a payment awaiting verification can be approved.",
      );
    }
    if (!invoice.planCode) {
      throw new ValidationError("This invoice has no priced plan to activate.");
    }
    if (!invoice.providerInvoiceId) {
      throw new ValidationError("This invoice has no payment reference.");
    }

    try {
      await repos.paymentTransactionRepository.create({
        invoiceId: invoice.id,
        provider: invoice.provider,
        providerPaymentId: invoice.providerInvoiceId,
        amountMnt: invoice.amountMnt,
        currency: invoice.currency,
        status: PaymentTransactionStatus.PAID,
        paidAt: now,
        metadata: { verifiedByUserId: actor.userId },
      });
    } catch (error) {
      if (error instanceof DuplicatePaymentError) {
        const paid = await repos.invoiceRepository.findById(invoice.id);
        return { alreadyProcessed: true, invoice: paid ?? invoice, subscription: null };
      }
      throw error;
    }

    const verified = await repos.invoiceRepository.recordManualVerification(invoice.id, {
      status: InvoiceStatus.PAID,
      verifiedByUserId: actor.userId,
      verifiedAt: now,
    });
    const subscription = await activateOrRenewPaidSubscription({
      userId: verified.userId,
      planCode: invoice.planCode,
      providerInvoiceId: invoice.providerInvoiceId,
      now,
      repos,
    });
    const linked = await repos.invoiceRepository.linkSubscription(verified.id, subscription.id);

    return { alreadyProcessed: false, invoice: linked, subscription };
  });
}
