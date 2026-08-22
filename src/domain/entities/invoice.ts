import type {
  InvoiceStatus,
  PaymentTransactionStatus,
  SubscriptionPlanCode,
} from "@/domain/enums";

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
  planCode: SubscriptionPlanCode;
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
  planCode: SubscriptionPlanCode;
  amountMnt: number;
  currency: string;
  provider: string;
  status: InvoiceStatus;
  expiresAt: Date;
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
