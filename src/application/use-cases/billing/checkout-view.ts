import type { Invoice } from "@/domain/entities/invoice";
import type { InvoiceDeeplink } from "@/domain/entities/invoice";
import { InvoiceStatus } from "@/domain/enums";

export const SOLO_INVOICE_TTL_MS = 24 * 60 * 60 * 1000;
export const SOLO_INVOICE_DESCRIPTION = "TORE SOLO — 1 month";

export type SoloCheckoutView = {
  invoiceId: string;
  planCode: string;
  amountMnt: number;
  currency: string;
  status: InvoiceStatus;
  expiresAt: string;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: InvoiceDeeplink[];
};

export function toSoloCheckoutView(invoice: Invoice): SoloCheckoutView {
  return {
    invoiceId: invoice.id,
    planCode: invoice.planCode,
    amountMnt: invoice.amountMnt,
    currency: invoice.currency,
    status: invoice.status,
    expiresAt: invoice.expiresAt.toISOString(),
    qrText: invoice.qrText,
    qrImage: invoice.qrImage,
    shortUrl: invoice.shortUrl,
    deeplinks: invoice.deeplinks,
  };
}
