import { getPlanDefinition } from "@/domain/constants/subscription-plans";
import {
  BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
  BILLING_PROVIDER_MANUAL_QR,
} from "@/domain/enums";
import type { Invoice } from "@/domain/entities/invoice";
import type { ManualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";

export type BillingCenterCheckoutMethod = "QR" | "BANK_TRANSFER" | "QPAY";

/**
 * The pending-invoice card in the Billing Center -- same shape the Legal AI
 * entitlement gate already renders. A strict superset of the older
 * SoloCheckoutView fields (currency/qrText/deeplinks/expiresAt) so this
 * stays a drop-in replacement for /api/lawyer/billing's existing consumer
 * (BillingAndSessionsPanel on /lawyer/profile), which reads those directly.
 */
export type BillingCenterPendingInvoice = {
  invoiceId: string;
  planCode: string | null;
  amountMnt: number;
  currency: string;
  status: string;
  expiresAt: string;
  method: BillingCenterCheckoutMethod;
  reference: string | null;
  paymentCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  qrAssetUrl: string | null;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: Invoice["deeplinks"];
};

export type BillingHistoryRow = {
  id: string;
  planCode: string | null;
  planName: string | null;
  amountMnt: number;
  status: string;
  provider: string;
  method: BillingCenterCheckoutMethod;
  paymentCode: string | null;
  createdAt: string;
};

function methodFromProvider(provider: string): BillingCenterCheckoutMethod {
  if (provider === BILLING_PROVIDER_MANUAL_QR) return "QR";
  if (provider === BILLING_PROVIDER_MANUAL_BANK_TRANSFER) return "BANK_TRANSFER";
  return "QPAY";
}

/** Deterministic from the invoice's own id -- mirrors create-manual-checkout.ts's own fallback exactly. */
function manualPaymentReference(invoiceId: string): string {
  return `TORE-${invoiceId.slice(-8).toUpperCase()}`;
}

export function toBillingCenterPendingInvoice(
  invoice: Invoice,
  config: ManualPaymentConfig,
): BillingCenterPendingInvoice {
  const method = methodFromProvider(invoice.provider);
  const isManual = method !== "QPAY";
  return {
    invoiceId: invoice.id,
    planCode: invoice.planCode,
    amountMnt: invoice.amountMnt,
    currency: invoice.currency,
    status: invoice.status,
    expiresAt: invoice.expiresAt.toISOString(),
    method,
    reference: isManual
      ? (invoice.paymentCode ?? invoice.providerInvoiceId ?? manualPaymentReference(invoice.id))
      : null,
    paymentCode: invoice.paymentCode,
    bankName: isManual ? config.bankName : null,
    bankAccountNumber: isManual ? config.bankAccountNumber : null,
    bankAccountName: isManual ? config.bankAccountName : null,
    qrAssetUrl: method === "QR" ? config.qrAssetUrl : null,
    qrText: invoice.qrText,
    qrImage: invoice.qrImage,
    shortUrl: invoice.shortUrl,
    deeplinks: invoice.deeplinks,
  };
}

export function toBillingHistoryRow(invoice: Invoice): BillingHistoryRow {
  return {
    id: invoice.id,
    planCode: invoice.planCode,
    planName: invoice.planCode ? getPlanDefinition(invoice.planCode).name : null,
    amountMnt: invoice.amountMnt,
    status: invoice.status,
    provider: invoice.provider,
    method: methodFromProvider(invoice.provider),
    paymentCode: invoice.paymentCode,
    createdAt: invoice.createdAt.toISOString(),
  };
}
