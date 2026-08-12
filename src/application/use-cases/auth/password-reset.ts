import type { EmailSender } from "@/domain/ports/email-sender";
import type { EmailVerificationTokenRepository } from "@/domain/repositories/email-verification-token-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  buildPasswordResetUrl,
  generatePasswordResetRawToken,
  hashPasswordResetToken,
  parsePasswordResetIdentifier,
  passwordResetExpiry,
  passwordResetIdentifier,
} from "@/domain/services/password-reset-token";
import {
  ValidationError,
} from "@/domain/errors/domain-error";
import { hash } from "bcryptjs";

export type PasswordResetDeps = {
  userRepository: UserRepository;
  emailVerificationTokenRepository: EmailVerificationTokenRepository;
  emailSender: EmailSender;
  appUrl: string;
  appName: string;
};

/**
 * Request a password reset. Always returns ok — never reveals whether the email exists.
 */
export async function requestPasswordResetUseCase(
  email: string,
  deps: PasswordResetDeps,
): Promise<{ ok: true }> {
  const normalized = email.trim().toLowerCase();
  const user = await deps.userRepository.findByEmail(normalized);

  if (!user || !user.email) {
    return { ok: true };
  }

  // Only accounts with local passwords can reset this way.
  const withHash = await deps.userRepository.findByEmailWithPasswordHash(
    normalized,
  );
  if (!withHash) {
    return { ok: true };
  }

  const rawToken = generatePasswordResetRawToken();
  const tokenHash = hashPasswordResetToken(rawToken);
  const expires = passwordResetExpiry();
  const identifier = passwordResetIdentifier(normalized);

  await deps.emailVerificationTokenRepository.replaceForIdentifier({
    identifier,
    tokenHash,
    expires,
  });

  const resetUrl = buildPasswordResetUrl({
    appUrl: deps.appUrl,
    rawToken,
  });

  const subject = `Reset your ${deps.appName} password`;
  const text = [
    `We received a request to reset the password for your ${deps.appName} account.`,
    "",
    `Open this link to choose a new password (expires in 1 hour):`,
    resetUrl,
    "",
    "If you did not request a reset, you can ignore this message.",
  ].join("\n");
  const html = `<p>We received a request to reset the password for your <strong>${deps.appName}</strong> account.</p>
<p><a href="${resetUrl}">Choose a new password</a></p>
<p style="color:#5A6B64;font-size:14px">This link expires in 1 hour. If you did not request a reset, ignore this message.</p>`;

  try {
    await deps.emailSender.send({
      to: user.email,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("[email:password-reset] send failed after token persisted", {
      error,
    });
    // Still return ok to callers (anti-enumeration); token exists for retry via another request.
  }

  return { ok: true };
}

/**
 * Consume a one-time reset token and set a new password hash.
 */
export async function resetPasswordWithTokenUseCase(
  input: { rawToken: string; newPassword: string },
  deps: PasswordResetDeps,
): Promise<{ ok: true }> {
  const raw = input.rawToken.trim();
  if (!raw) {
    throw new ValidationError("Reset link is invalid or has expired");
  }

  const tokenHash = hashPasswordResetToken(raw);
  const record =
    await deps.emailVerificationTokenRepository.findByTokenHash(tokenHash);
  if (!record || record.expires.getTime() < Date.now()) {
    throw new ValidationError("Reset link is invalid or has expired");
  }

  const email = parsePasswordResetIdentifier(record.identifier);
  if (!email) {
    throw new ValidationError("Reset link is invalid or has expired");
  }

  const withHash = await deps.userRepository.findByEmailWithPasswordHash(email);
  if (!withHash) {
    await deps.emailVerificationTokenRepository.deleteByTokenHash(tokenHash);
    throw new ValidationError("Reset link is invalid or has expired");
  }

  const passwordHash = await hash(input.newPassword, 12);
  await deps.userRepository.updatePasswordHash(withHash.user.id, passwordHash);
  await deps.emailVerificationTokenRepository.deleteByTokenHash(tokenHash);
  // Also clear any other reset tokens for this email.
  await deps.emailVerificationTokenRepository.deleteForIdentifier(
    passwordResetIdentifier(email),
  );

  return { ok: true };
}

export async function assertPasswordResetTokenValid(
  rawToken: string,
  deps: Pick<PasswordResetDeps, "emailVerificationTokenRepository">,
): Promise<{ valid: true } | { valid: false }> {
  const tokenHash = hashPasswordResetToken(rawToken.trim());
  const record =
    await deps.emailVerificationTokenRepository.findByTokenHash(tokenHash);
  if (!record || record.expires.getTime() < Date.now()) {
    return { valid: false };
  }
  if (!parsePasswordResetIdentifier(record.identifier)) {
    return { valid: false };
  }
  return { valid: true };
}
