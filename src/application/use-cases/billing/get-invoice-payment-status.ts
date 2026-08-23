import type { ActorContext } from "@/application/common/actor-context";
import { assertLawyerEntitlementActor } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import {
  toSoloCheckoutView,
  type SoloCheckoutView,
} from "@/application/use-cases/billing/checkout-view";
import {
  processQpayInvoicePayment,
  type ProcessQpayPaymentDeps,
} from "@/application/use-cases/billing/process-qpay-payment";
import type { Invoice } from "@/domain/entities/invoice";
import type { Subscription } from "@/domain/entities/subscription";
import { InvoiceStatus } from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import {
  resolveBillingDisplayStatus,
  type BillingDisplayStatus,
} from "@/domain/services/billing-display-status";
import { isSubscriptionActive } from "@/domain/services/entitlement";

export type InvoicePaymentStatusView = {
  invoice: SoloCheckoutView;
  invoiceStatus: InvoiceStatus;
  subscriptionStatus: BillingDisplayStatus;
  subscriptionId: string | null;
  expiresAt: string | null;
  paid: boolean;
};

export type InvoicePaymentStatusDeps = ProcessQpayPaymentDeps & {
  invoiceRepository: InvoiceRepository;
  subscriptionRepository: SubscriptionRepository;
};

export async function getOwnInvoicePaymentStatus(
  actor: ActorContext,
  invoiceId: string,
  deps: InvoicePaymentStatusDeps,
  now: Date = new Date(),
): Promise<InvoicePaymentStatusView> {
  assertLawyerEntitlementActor(actor);

  const invoice = await deps.invoiceRepository.findById(invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice");
  }
  if (invoice.userId !== actor.userId) {
    throw new ForbiddenError();
  }

  if (
    invoice.status === InvoiceStatus.PENDING &&
    invoice.providerInvoiceId
  ) {
    try {
      const processed = await processQpayInvoicePayment(
        invoice.providerInvoiceId,
        deps,
        now,
      );
      return toStatusView(processed.invoice, processed.subscription, now);
    } catch (error) {
      if (
        error instanceof PaymentVerificationError &&
        (error.code === "PAYMENT_NOT_SUCCESSFUL" ||
          error.code === "WRONG_AMOUNT" ||
          error.code === "UNPRICED_PLAN")
      ) {
        const latest = await deps.invoiceRepository.findById(invoice.id);
        return toStatusView(latest ?? invoice, null, now);
      }
      throw error;
    }
  }

  const subscription = invoice.subscriptionId
    ? await deps.subscriptionRepository.findById(invoice.subscriptionId)
    : await deps.subscriptionRepository.findLatestOwnedByUserId(actor.userId);

  return toStatusView(invoice, subscription, now);
}

function toStatusView(
  invoice: Invoice,
  subscription: Subscription | null,
  now: Date,
): InvoicePaymentStatusView {
  const paid = invoice.status === InvoiceStatus.PAID;
  const active = subscription
    ? isSubscriptionActive(subscription, now)
    : false;
  return {
    invoice: toSoloCheckoutView(invoice),
    invoiceStatus: invoice.status,
    subscriptionStatus: resolveBillingDisplayStatus({
      now,
      subscription,
      hasPendingInvoice: invoice.status === InvoiceStatus.PENDING,
    }),
    subscriptionId: subscription?.id ?? null,
    expiresAt: subscription?.currentPeriodEnd.toISOString() ?? null,
    paid: paid && active,
  };
}
