import { SESSION_REPLACED_MESSAGE } from "@/domain/services/active-session-constants";

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    // Keep resource for ops logs via Error stack; never include internal IDs for clients.
    super(`${resource} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
    if (id) {
      this.cause = { resource, id };
    }
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 422);
    this.name = "ValidationError";
  }
}

/** Email verification link failures. Client copy must stay generic. */
export class EmailVerificationLinkError extends DomainError {
  constructor(public readonly reason: "invalid" | "expired" | "missing") {
    super(
      "This verification link is invalid or has expired.",
      "EMAIL_VERIFICATION_INVALID",
      400,
    );
    this.name = "EmailVerificationLinkError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

/** Safe client mapping only — never attach SMTP/API details. */
export class EmailAlreadyVerifiedError extends DomainError {
  constructor() {
    super("This email is already verified.", "EMAIL_ALREADY_VERIFIED", 409);
    this.name = "EmailAlreadyVerifiedError";
  }
}

export class EmailNotFoundError extends DomainError {
  constructor() {
    super("No account was found for this email.", "EMAIL_NOT_FOUND", 404);
    this.name = "EmailNotFoundError";
  }
}

export class EmailConfigurationError extends DomainError {
  constructor() {
    super("Email delivery is not configured.", "EMAIL_CONFIGURATION", 503);
    this.name = "EmailConfigurationError";
  }
}

/** Previous device/session was replaced by a newer login. Safe to show to users. */
export class SessionReplacedError extends DomainError {
  constructor(message = SESSION_REPLACED_MESSAGE) {
    super(message, "SESSION_REPLACED", 401);
    this.name = "SessionReplacedError";
  }
}

export class EmailDeliveryError extends DomainError {
  constructor() {
    super("The verification email could not be sent.", "EMAIL_DELIVERY_FAILED", 503);
    this.name = "EmailDeliveryError";
  }
}
