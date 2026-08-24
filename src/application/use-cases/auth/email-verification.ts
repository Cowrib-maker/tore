import { buildEmailVerificationMessage } from "@/application/services/email-verification-message";
import {
  ConflictError,
  EmailVerificationLinkError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { UserRole } from "@/domain/enums";
import type { EmailSender } from "@/domain/ports/email-sender";
import type { EmailVerificationTokenRepository } from "@/domain/repositories/email-verification-token-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  buildEmailVerificationUrl,
  emailVerificationExpiry,
  generateEmailVerificationRawToken,
  hashEmailVerificationToken,
} from "@/domain/services/email-verification-token";

export type EmailVerificationDeps = {
  userRepository: UserRepository;
  emailVerificationTokenRepository: EmailVerificationTokenRepository;
  emailSender: EmailSender;
  appUrl: string;
  appName: string;
  ttlHours: number;
};

/**
 * Issue a one-time token and send the verification email.
 * Token is always persisted first; send failures are logged and rethrown
 * so callers can decide UX — resend remains available.
 */
export async function sendEmailVerificationUseCase(
  email: string,
  deps: EmailVerificationDeps,
): Promise<{ sent: true }> {
  const normalized = email.trim().toLowerCase();
  const user = await deps.userRepository.findByEmail(normalized);
  if (!user) {
    // Anti-enumeration: behave like success from caller's public API when needed;
    // internal callers should pass known emails. For resend we still hide existence.
    throw new NotFoundError("User");
  }

  if (user.emailVerified) {
    throw new ConflictError("This email is already verified");
  }

  const rawToken = generateEmailVerificationRawToken();
  const tokenHash = hashEmailVerificationToken(rawToken);
  const expires = emailVerificationExpiry(deps.ttlHours);

  await deps.emailVerificationTokenRepository.replaceForIdentifier({
    identifier: user.email,
    tokenHash,
    expires,
  });

  const verifyUrl = buildEmailVerificationUrl({
    appUrl: deps.appUrl,
    rawToken,
  });
  const message = buildEmailVerificationMessage({
    appName: deps.appName,
    toName: user.name,
    verifyUrl,
    ttlHours: deps.ttlHours,
  });

  try {
    const result = await deps.emailSender.send({
      to: user.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    console.info("[email:verification] sent", {
      to: user.email,
      messageId: result.messageId,
      expiresAt: expires.toISOString(),
    });
  } catch (error) {
    console.error("[email:verification] send failed after token persisted", {
      to: user.email,
      error,
    });
    throw error instanceof Error
      ? error
      : new Error("Failed to send verification email");
  }

  return { sent: true };
}

/**
 * Public resend path — never reveals whether the email exists.
 * Already-verified and unknown emails return a generic success-shaped result.
 */
export async function resendEmailVerificationUseCase(
  email: string,
  deps: EmailVerificationDeps,
): Promise<{ ok: true; alreadyVerified?: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    throw new ValidationError("Enter a valid email address");
  }

  const user = await deps.userRepository.findByEmail(normalized);
  if (!user) {
    console.info("[email:verification] resend ignored — unknown email", {
      email: normalized,
    });
    return { ok: true };
  }

  if (user.emailVerified) {
    return { ok: true, alreadyVerified: true };
  }

  try {
    await sendEmailVerificationUseCase(user.email, deps);
  } catch (error) {
    // Public resend must not distinguish send failure from unknown email.
    console.error("[email:verification] resend send failed", {
      email: user.email,
      error,
    });
  }
  return { ok: true };
}

export async function verifyEmailTokenUseCase(
  rawToken: string,
  deps: Pick<
    EmailVerificationDeps,
    "userRepository" | "emailVerificationTokenRepository"
  >,
): Promise<{ email: string; role: UserRole }> {
  if (!rawToken || rawToken.length < 16) {
    throw new EmailVerificationLinkError("missing");
  }

  const tokenHash = hashEmailVerificationToken(rawToken);
  const record =
    await deps.emailVerificationTokenRepository.findByTokenHash(tokenHash);

  if (!record) {
    throw new EmailVerificationLinkError("invalid");
  }

  if (record.expires.getTime() <= Date.now()) {
    await deps.emailVerificationTokenRepository.deleteByTokenHash(tokenHash);
    throw new EmailVerificationLinkError("expired");
  }

  const user = await deps.userRepository.findByEmail(record.identifier);
  if (!user) {
    await deps.emailVerificationTokenRepository.deleteByTokenHash(tokenHash);
    throw new EmailVerificationLinkError("invalid");
  }

  if (!user.emailVerified) {
    await deps.userRepository.markEmailVerified(user.id);
  }

  await deps.emailVerificationTokenRepository.deleteForIdentifier(
    record.identifier,
  );

  console.info("[email:verification] confirmed", { email: user.email });
  return { email: user.email, role: user.role };
}
