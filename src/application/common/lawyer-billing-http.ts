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
import { billingUnitOfWork } from "@/infrastructure/database/prisma-billing-unit-of-work";
import { invoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";
import { paymentTransactionRepository } from "@/infrastructure/repositories/prisma-payment-transaction-repository";
import { subscriptionRepository } from "@/infrastructure/repositories/prisma-subscription-repository";
import { bookingRepository } from "@/infrastructure/repositories/prisma-booking-repository";
import { lawyerProfileRepository } from "@/infrastructure/repositories/prisma-lawyer-profile-repository";
import { notificationRepository } from "@/infrastructure/repositories/prisma-notification-repository";
import { auditLogRepository } from "@/infrastructure/repositories/prisma-audit-log-repository";

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
