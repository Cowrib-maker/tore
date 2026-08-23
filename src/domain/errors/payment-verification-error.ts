import { DomainError } from "@/domain/errors/domain-error";

export type PaymentVerificationCode =
  | "WRONG_AMOUNT"
  | "WRONG_INVOICE"
  | "UNPRICED_PLAN"
  | "PAYMENT_NOT_SUCCESSFUL"
  | "BILLING_PROVIDER_NOT_CONFIGURED"
  | "QPAY_NOT_CONFIGURED"
  | "QPAY_UNAVAILABLE";

export class PaymentVerificationError extends DomainError {
  constructor(message: string, code: PaymentVerificationCode, statusCode = 400) {
    super(message, code, statusCode);
    this.name = "PaymentVerificationError";
  }
}
