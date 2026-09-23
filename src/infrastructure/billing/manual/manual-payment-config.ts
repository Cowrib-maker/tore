import { env } from "@/lib/env";
import type { Env } from "@/lib/env-schema";

export type ManualPaymentEnv = Pick<
  Env,
  | "MANUAL_PAYMENT_ENABLED"
  | "MANUAL_BANK_NAME"
  | "MANUAL_BANK_ACCOUNT"
  | "MANUAL_ACCOUNT_NAME"
  | "MANUAL_QR_ASSET"
>;

export type ManualPaymentConfig = {
  enabled: boolean;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  /**
   * Path/URL to the real, already-printed QPay QR image. Null when not
   * configured — the UI must then say the QR method is unavailable
   * rather than render a placeholder that looks like a real QR code.
   */
  qrAssetUrl: string | null;
};

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

export function readManualPaymentConfig(source: ManualPaymentEnv): ManualPaymentConfig {
  return {
    enabled: source.MANUAL_PAYMENT_ENABLED,
    bankName: trimmed(source.MANUAL_BANK_NAME),
    bankAccountNumber: trimmed(source.MANUAL_BANK_ACCOUNT),
    bankAccountName: trimmed(source.MANUAL_ACCOUNT_NAME),
    qrAssetUrl: trimmed(source.MANUAL_QR_ASSET),
  };
}

/** Real-env convenience wrapper — see qpay-config.ts's isQpayConfigured/createQpayGateway for the same injectable-config pattern. */
export function manualPaymentConfig(): ManualPaymentConfig {
  return readManualPaymentConfig(env);
}
