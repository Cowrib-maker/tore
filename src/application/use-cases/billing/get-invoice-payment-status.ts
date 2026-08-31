import type { ActorContext } from "@/application/common/actor-context";
import {
  toSoloCheckoutView,
  type SoloCheckoutView,
} from "@/application/use-cases/billing/checkout-view";
import { completePaidConsultationBooking } from "@/application/use-cases/billing/complete-paid-consultation";
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
  const invoice = await deps.invoiceRepository.findById(invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice");
  }
  if (invoice.userId !== actor.userId) {
    throw new ForbiddenError();
  }

  if (invoice.status === InvoiceStatus.PENDING && invoice.providerInvoiceId) {
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

  if (
    invoice.bookingId &&
    invoice.status === InvoiceStatus.PAID &&
    deps.bookingRepository
  ) {
    await completePaidConsultationBooking(invoice, {
      bookingRepository: deps.bookingRepository,
      lawyerProfileRepository: deps.lawyerProfileRepository,
      notificationRepository: deps.notificationRepository,
      auditLogRepository: deps.auditLogRepository,
    });
  }

  const subscription = invoice.subscriptionId
    ? await deps.subscriptionRepository.findById(invoice.subscriptionId)
    : invoice.planCode
      ? await deps.subscriptionRepository.findLatestOwnedByUserId(actor.userId)
      : null;

  return toStatusView(invoice, subscription, now);
}

function toStatusView(
  invoice: Invoice,
  subscription: Subscription | null,
  now: Date,
): InvoicePaymentStatusView {
  const invoicePaid = invoice.status === InvoiceStatus.PAID;
  const active = subscription
    ? isSubscriptionActive(subscription, now)
    : false;
  const paid = invoice.bookingId ? invoicePaid : invoicePaid && active;
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
    paid,
  };
}
