import { classifyEmailSendFailure } from "@/application/common/map-email-verification-error";
import { buildEmailVerificationMessage } from "@/application/services/email-verification-message";
import {
  EmailAlreadyVerifiedError,
  EmailNotFoundError,
  EmailVerificationLinkError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { UserRole } from "@/domain/enums";
import type { EmailSender } from "@/domain/ports/email-sender";
import type { EmailVerificationTokenRepository } from "@/domain/repositories/email-verification-token-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  EMAIL_VERIFICATION_OTP_TTL_MINUTES,
  emailVerificationHashesMatch,
  emailVerificationOtpExpiry,
  generateEmailVerificationOtp,
  hashEmailVerificationOtp,
  isCompleteEmailVerificationOtp,
  normalizeEmailVerificationOtp,
} from "@/domain/services/email-verification-token";

export type EmailVerificationDeps = {
  userRepository: UserRepository;
  emailVerificationTokenRepository: EmailVerificationTokenRepository;
  emailSender: EmailSender;
  appUrl: string;
  appName: string;
  ttlMinutes: number;
};

/**
 * Issue a one-time 6-digit OTP and send it by email.
 * Only the SHA-256 digest is persisted. Send failures are rethrown after
 * the digest is stored so resend remains available.
 */
export async function sendEmailVerificationUseCase(
  email: string,
  deps: EmailVerificationDeps,
): Promise<{ sent: true }> {
  const normalized = email.trim().toLowerCase();
  const user = await deps.userRepository.findByEmail(normalized);
  if (!user) {
    throw new EmailNotFoundError();
  }

  if (user.emailVerified) {
    throw new EmailAlreadyVerifiedError();
  }

  const otp = generateEmailVerificationOtp();
  const tokenHash = hashEmailVerificationOtp(user.email, otp);
  const ttlMinutes = deps.ttlMinutes || EMAIL_VERIFICATION_OTP_TTL_MINUTES;
  const expires = emailVerificationOtpExpiry(ttlMinutes);

  await deps.emailVerificationTokenRepository.replaceForIdentifier({
    identifier: user.email,
    tokenHash,
    expires,
  });

  const message = buildEmailVerificationMessage({
    appName: deps.appName,
    toName: user.name,
    otp,
    ttlMinutes,
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
    throw classifyEmailSendFailure(error);
  }

  return { sent: true };
}

/**
 * Public resend path. Unknown / already-verified / delivery failures are typed
 * domain errors so the action can map them to safe user-facing copy.
 */
export async function resendEmailVerificationUseCase(
  email: string,
  deps: EmailVerificationDeps,
): Promise<{ ok: true }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    throw new ValidationError("Enter a valid email address");
  }

  const user = await deps.userRepository.findByEmail(normalized);
  if (!user) {
    throw new EmailNotFoundError();
  }

  if (user.emailVerified) {
    throw new EmailAlreadyVerifiedError();
  }

  await sendEmailVerificationUseCase(user.email, deps);
  return { ok: true };
}

export async function verifyEmailOtpUseCase(
  input: { email: string; otp: string },
  deps: Pick<
    EmailVerificationDeps,
    "userRepository" | "emailVerificationTokenRepository"
  >,
): Promise<{ email: string; role: UserRole }> {
  const email = input.email.trim().toLowerCase();
  const otp = normalizeEmailVerificationOtp(input.otp);

  if (!email.includes("@")) {
    throw new ValidationError("Enter a valid email address");
  }

  if (!isCompleteEmailVerificationOtp(otp)) {
    throw new EmailVerificationLinkError("invalid");
  }

  const user = await deps.userRepository.findByEmail(email);
  if (!user) {
    throw new EmailVerificationLinkError("invalid");
  }

  if (user.emailVerified) {
    throw new EmailAlreadyVerifiedError();
  }

  const record =
    await deps.emailVerificationTokenRepository.findByIdentifier(user.email);

  if (!record) {
    throw new EmailVerificationLinkError("invalid");
  }

  if (record.expires.getTime() <= Date.now()) {
    await deps.emailVerificationTokenRepository.deleteForIdentifier(
      record.identifier,
    );
    throw new EmailVerificationLinkError("expired");
  }

  const submittedHash = hashEmailVerificationOtp(user.email, otp);
  if (!emailVerificationHashesMatch(record.tokenHash, submittedHash)) {
    throw new EmailVerificationLinkError("invalid");
  }

  await deps.userRepository.markEmailVerified(user.id);
  await deps.emailVerificationTokenRepository.deleteForIdentifier(
    record.identifier,
  );

  console.info("[email:verification] confirmed", { email: user.email });
  return { email: user.email, role: user.role };
}
