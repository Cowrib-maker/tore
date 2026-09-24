import { randomInt } from "node:crypto";

/**
 * A short, customer-facing "Гүйлгээний утга" for manual (bank transfer /
 * printed QR) payments — always exactly 4 digits, "0000"–"9999",
 * cryptographically random (never guessable/sequential). Never the
 * canonical invoice identity — see `Invoice.paymentCode`'s doc comment.
 */
export function generateManualPaymentCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}
