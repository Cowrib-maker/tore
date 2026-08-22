export type QpayDeeplink = {
  name: string;
  description: string;
  logo: string;
  link: string;
};

export type QpayCreateInvoiceInput = {
  senderInvoiceNo: string;
  amountMnt: number;
  description: string;
  callbackUrl: string;
};

export type QpayCreatedInvoice = {
  providerInvoiceId: string;
  qrText: string;
  qrImage: string;
  shortUrl: string | null;
  urls: QpayDeeplink[];
};

export type QpayCheckedPaymentRow = {
  paymentId: string;
  status: string;
  amountMnt: number;
  currency: string;
};

export type QpayCheckedPayment = {
  count: number;
  paidAmountMnt: number;
  rows: QpayCheckedPaymentRow[];
};

/**
 * Server-only QPay Merchant V2 port.
 * Authenticate is an adapter concern — callers create invoices and check payments.
 */
export interface QpayGateway {
  createInvoice(input: QpayCreateInvoiceInput): Promise<QpayCreatedInvoice>;
  checkPayment(providerInvoiceId: string): Promise<QpayCheckedPayment>;
}
