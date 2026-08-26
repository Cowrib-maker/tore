import { classifyEmailSendFailure } from "@/application/common/map-email-verification-error";
import { EMAIL_VERIFICATION_OTP_TTL_MINUTES } from "@/domain/services/email-verification-token";
import { env } from "@/lib/env";
import { getEmailSender } from "@/infrastructure/email";
import {
  emailVerificationTokenRepository,
  userRepository,
} from "@/infrastructure/repositories";
import type { EmailVerificationDeps } from "@/application/use-cases/auth/email-verification";

export function getEmailVerificationDeps(): EmailVerificationDeps {
  try {
    return {
      userRepository,
      emailVerificationTokenRepository,
      emailSender: getEmailSender(),
      appUrl: env.NEXT_PUBLIC_APP_URL,
      appName: env.NEXT_PUBLIC_APP_NAME,
      ttlMinutes: EMAIL_VERIFICATION_OTP_TTL_MINUTES,
    };
  } catch (error) {
    throw classifyEmailSendFailure(error);
  }
}

/**
 * Persist token + send verification email after registration.
 * Registration itself must not fail if delivery fails — token remains for resend.
 * Delivery errors are always logged.
 */
export async function issueVerificationEmailAfterRegister(
  email: string,
): Promise<{ sent: boolean }> {
  const { sendEmailVerificationUseCase } = await import(
    "@/application/use-cases/auth/email-verification"
  );
  try {
    await sendEmailVerificationUseCase(email, getEmailVerificationDeps());
    return { sent: true };
  } catch (error) {
    console.error(
      "[email:verification] post-register send failed (account created; user can resend)",
      { email, error },
    );
    return { sent: false };
  }
}
