import { QPAY_NOT_CONFIGURED_MESSAGE } from "@/application/common/public-service-errors";
import {
  DEFAULT_QPAY_BASE_URL,
  type Env,
} from "@/lib/env-schema";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";

export type QpayEnv = Pick<
  Env,
  | "QPAY_BASE_URL"
  | "QPAY_CLIENT_ID"
  | "QPAY_CLIENT_SECRET"
  | "QPAY_CALLBACK_URL"
  | "QPAY_INVOICE_CODE"
>;

export type QpayConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  invoiceCode: string;
};

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * True only when QPay can be used for checkout and payment/check.
 * Missing, empty, or invalid values are treated as unconfigured — never as
 * fake credentials.
 */
export function isQpayConfigured(env: QpayEnv): boolean {
  const baseUrl = trimmed(env.QPAY_BASE_URL) || DEFAULT_QPAY_BASE_URL;
  const clientId = trimmed(env.QPAY_CLIENT_ID);
  const clientSecret = trimmed(env.QPAY_CLIENT_SECRET);
  const callbackUrl = trimmed(env.QPAY_CALLBACK_URL);
  const invoiceCode = trimmed(env.QPAY_INVOICE_CODE);

  return (
    clientId.length > 0 &&
    clientSecret.length > 0 &&
    invoiceCode.length > 0 &&
    isAbsoluteUrl(baseUrl) &&
    isAbsoluteUrl(callbackUrl)
  );
}

export function readQpayConfig(env: QpayEnv): QpayConfig {
  if (!isQpayConfigured(env)) {
    throw new PaymentVerificationError(
      QPAY_NOT_CONFIGURED_MESSAGE,
      "BILLING_PROVIDER_NOT_CONFIGURED",
      503,
    );
  }

  return {
    baseUrl: (trimmed(env.QPAY_BASE_URL) || DEFAULT_QPAY_BASE_URL).replace(
      /\/+$/,
      "",
    ),
    clientId: trimmed(env.QPAY_CLIENT_ID),
    clientSecret: trimmed(env.QPAY_CLIENT_SECRET),
    callbackUrl: trimmed(env.QPAY_CALLBACK_URL),
    invoiceCode: trimmed(env.QPAY_INVOICE_CODE),
  };
}
