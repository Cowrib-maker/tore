import { DomainError } from "@/domain/errors/domain-error";

export class EmailNotVerifiedError extends DomainError {
  constructor() {
    super(
      "Please verify your email to continue.",
      "EMAIL_NOT_VERIFIED",
      403,
    );
    this.name = "EmailNotVerifiedError";
  }
}

export function assertUserEmailVerified(
  user: { emailVerified: Date | null } | null | undefined,
): void {
  if (!user?.emailVerified) {
    throw new EmailNotVerifiedError();
  }
}
