import type { Env } from "@/lib/env-schema";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";

export type QpayConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  invoiceCode: string;
};

export function readQpayConfig(env: Pick<
  Env,
  | "QPAY_BASE_URL"
  | "QPAY_CLIENT_ID"
  | "QPAY_CLIENT_SECRET"
  | "QPAY_CALLBACK_URL"
  | "QPAY_INVOICE_CODE"
>): QpayConfig {
  const baseUrl = env.QPAY_BASE_URL?.replace(/\/+$/, "");
  const clientId = env.QPAY_CLIENT_ID;
  const clientSecret = env.QPAY_CLIENT_SECRET;
  const callbackUrl = env.QPAY_CALLBACK_URL;
  const invoiceCode = env.QPAY_INVOICE_CODE;

  if (!baseUrl || !clientId || !clientSecret || !callbackUrl || !invoiceCode) {
    throw new PaymentVerificationError(
      "QPay is not configured",
      "QPAY_NOT_CONFIGURED",
      503,
    );
  }

  return { baseUrl, clientId, clientSecret, callbackUrl, invoiceCode };
}
