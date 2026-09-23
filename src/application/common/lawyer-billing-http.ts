import type { BillingUnitOfWork } from "@/domain/ports/billing-unit-of-work";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { PaymentTransactionRepository } from "@/domain/repositories/invoice-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import type { NotificationRepository } from "@/domain/repositories/trust-repository";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";
import {
  createQpayGateway,
  isQpayConfigured,
  qpayCallbackUrl,
} from "@/infrastructure/billing/create-qpay-gateway";
import { manualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";
import { billingUnitOfWork } from "@/infrastructure/database/prisma-billing-unit-of-work";
import { invoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";
import { paymentTransactionRepository } from "@/infrastructure/repositories/prisma-payment-transaction-repository";
import { subscriptionRepository } from "@/infrastructure/repositories/prisma-subscription-repository";
import { bookingRepository } from "@/infrastructure/repositories/prisma-booking-repository";
import { lawyerProfileRepository } from "@/infrastructure/repositories/prisma-lawyer-profile-repository";
import { notificationRepository } from "@/infrastructure/repositories/prisma-notification-repository";
import { auditLogRepository } from "@/infrastructure/repositories/prisma-audit-log-repository";
import type { CreateManualCheckoutDeps } from "@/application/use-cases/billing/create-manual-checkout";
import type { ClaimManualPaymentDeps } from "@/application/use-cases/billing/claim-manual-payment";

export type LawyerBillingDeps = {
  invoiceRepository: InvoiceRepository;
  paymentTransactionRepository: PaymentTransactionRepository;
  subscriptionRepository: SubscriptionRepository;
  billingUnitOfWork: BillingUnitOfWork;
  qpayGateway: QpayGateway;
  qpayCallbackUrl: string;
  bookingRepository: BookingRepository;
  lawyerProfileRepository: LawyerProfileRepository;
  notificationRepository: NotificationRepository;
  auditLogRepository: AuditLogRepository;
};

/**
 * Composition root for the manual (bank transfer / printed QR) payment
 * routes — deliberately independent of {@link lawyerBillingDeps}, which
 * throws when QPay isn't configured. Manual payment must keep working
 * even with zero QPay credentials, since it exists specifically for that
 * situation.
 */
export function manualBillingDeps(): CreateManualCheckoutDeps & ClaimManualPaymentDeps {
  return {
    invoiceRepository,
    manualPaymentConfig: manualPaymentConfig(),
  };
}

export function lawyerBillingDeps(): LawyerBillingDeps {
  if (!isQpayConfigured()) {
    throw new PaymentVerificationError(
      "QPay is not configured",
      "BILLING_PROVIDER_NOT_CONFIGURED",
      503,
    );
  }
  return {
    invoiceRepository,
    paymentTransactionRepository,
    subscriptionRepository,
    billingUnitOfWork,
    qpayGateway: createQpayGateway(),
    qpayCallbackUrl: qpayCallbackUrl(),
    bookingRepository,
    lawyerProfileRepository,
    notificationRepository,
    auditLogRepository,
  };
}

/** Throws only if actually invoked — safe to hand to a deps bag whose caller never calls it for a non-QPay invoice. */
const qpayUnavailableGateway: QpayGateway = {
  async createInvoice() {
    throw new PaymentVerificationError("QPay is not configured", "BILLING_PROVIDER_NOT_CONFIGURED", 503);
  },
  async checkPayment() {
    throw new PaymentVerificationError("QPay is not configured", "BILLING_PROVIDER_NOT_CONFIGURED", 503);
  },
};

/**
 * Composition root for the own-invoice status-polling routes ONLY. Unlike
 * {@link lawyerBillingDeps}, this never throws just because QPay is
 * unconfigured — a manual invoice's status must still be readable (it
 * never calls qpayGateway; getOwnInvoicePaymentStatus only does that for
 * a QPay-provider invoice). A QPay invoice checked while QPay is
 * unconfigured still fails, but only at the point of actually trying to
 * verify it — the real, meaningful error for that case.
 */
export function invoiceStatusDeps(): LawyerBillingDeps {
  return {
    invoiceRepository,
    paymentTransactionRepository,
    subscriptionRepository,
    billingUnitOfWork,
    qpayGateway: isQpayConfigured() ? createQpayGateway() : qpayUnavailableGateway,
    qpayCallbackUrl: isQpayConfigured() ? qpayCallbackUrl() : "",
    bookingRepository,
    lawyerProfileRepository,
    notificationRepository,
    auditLogRepository,
  };
}
