import { DomainError } from "@/domain/errors/domain-error";

export class EntitlementError extends DomainError {
  constructor(
    message: string,
    code:
      | "FEATURE_QUOTA_EXCEEDED"
      | "TOKEN_CEILING_REACHED"
      | "ACCOUNT_SHARING_RESTRICTED"
      | "SUBSCRIPTION_INACTIVE"
      | "BILLING_REQUIRED"
      | "AUTHENTICATION_REQUIRED",
    statusCode = 403,
  ) {
    super(message, code, statusCode);
    this.name = "EntitlementError";
  }
}
