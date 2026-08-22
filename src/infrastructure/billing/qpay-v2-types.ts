/**
 * QPay Merchant V2 wire types. Keep these isolated from the domain.
 * Field names match the documented API; do not invent extras on requests.
 */

export type QpayV2TokenResponse = {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  "not-before-policy"?: number;
  session_state?: string;
};

export type QpayV2CreateInvoiceRequest = {
  invoice_code: string;
  sender_invoice_no: string;
  invoice_receiver_code: string;
  invoice_description: string;
  amount: number;
  callback_url: string;
};

export type QpayV2Url = {
  name: string;
  description: string;
  logo: string;
  link: string;
};

export type QpayV2CreateInvoiceResponse = {
  invoice_id: string;
  qr_text: string;
  qr_image: string;
  qPay_shortUrl?: string;
  urls?: QpayV2Url[];
};

export type QpayV2PaymentCheckRequest = {
  object_type: "INVOICE";
  object_id: string;
};

export type QpayV2PaymentCheckRow = {
  payment_id: string;
  payment_status: string;
  payment_amount: string;
  payment_currency: string;
};

export type QpayV2PaymentCheckResponse = {
  count: number;
  paid_amount: number;
  rows?: QpayV2PaymentCheckRow[];
};

export type QpayV2CallbackBody = {
  invoice_id: string;
};
