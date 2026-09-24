import { InvoiceStatus } from "@/domain/enums";
import type { PaymentTransactionStatus, SubscriptionPlanCode } from "@/domain/enums";

export type InvoiceDeeplink = {
  name: string;
  description: string;
  logo: string;
  link: string;
};

export type Invoice = {
  id: string;
  userId: string;
  subscriptionId: string | null;
  bookingId: string | null;
  planCode: SubscriptionPlanCode | null;
  amountMnt: number;
  currency: string;
  provider: string;
  providerInvoiceId: string | null;
  status: InvoiceStatus;
  expiresAt: Date;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: InvoiceDeeplink[];
  /** Manual-payment verification audit — always null for QPay invoices. */
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  /**
   * Short customer-facing "Гүйлгээний утга" for manual (bank transfer /
   * printed QR) payments only — always null for QPay invoices, which use
   * their own provider-issued reference instead. Never the canonical
   * identity of the invoice (that's `id`) and never unique forever (only
   * among currently PENDING/AWAITING_VERIFICATION invoices, enforced by a
   * partial unique index — see the migration that adds this column).
   */
  paymentCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentTransaction = {
  id: string;
  invoiceId: string;
  provider: string;
  providerPaymentId: string;
  amountMnt: number;
  currency: string;
  status: PaymentTransactionStatus;
  paidAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateInvoiceInput = {
  id?: string;
  userId: string;
  subscriptionId?: string | null;
  bookingId?: string | null;
  planCode?: SubscriptionPlanCode | null;
  amountMnt: number;
  currency: string;
  provider: string;
  status: InvoiceStatus;
  expiresAt: Date;
  /** Manual payments only — see `Invoice.paymentCode`. */
  paymentCode?: string | null;
};

export type AttachProviderInvoiceInput = {
  providerInvoiceId: string;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: InvoiceDeeplink[];
};

export type CreatePaymentTransactionInput = {
  invoiceId: string;
  provider: string;
  providerPaymentId: string;
  amountMnt: number;
  currency: string;
  status: PaymentTransactionStatus;
  paidAt: Date | null;
  metadata?: Record<string, unknown> | null;
};

/** Admin verify/reject of a manual (bank transfer / printed QR) payment claim. */
export type RecordManualVerificationInput = {
  status: InvoiceStatus.PAID | InvoiceStatus.FAILED;
  verifiedByUserId: string;
  verifiedAt: Date;
  rejectionReason?: string | null;
};
