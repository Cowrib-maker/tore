import { env } from "@/lib/env";
import { getEmailSender } from "@/infrastructure/email";
import {
  emailVerificationTokenRepository,
  userRepository,
} from "@/infrastructure/repositories";
import type { EmailVerificationDeps } from "@/application/use-cases/auth/email-verification";

export function getEmailVerificationDeps(): EmailVerificationDeps {
  return {
    userRepository,
    emailVerificationTokenRepository,
    emailSender: getEmailSender(),
    appUrl: env.NEXT_PUBLIC_APP_URL,
    appName: env.NEXT_PUBLIC_APP_NAME,
    ttlHours: env.EMAIL_VERIFICATION_TTL_HOURS,
  };
}

/**
 * Persist token + send verification email after registration.
 * Registration itself must not fail if delivery fails — token remains for resend.
 * Delivery errors are always logged.
 */
export async function issueVerificationEmailAfterRegister(
  email: string,
): Promise<void> {
  const { sendEmailVerificationUseCase } = await import(
    "@/application/use-cases/auth/email-verification"
  );
  try {
    await sendEmailVerificationUseCase(email, getEmailVerificationDeps());
  } catch (error) {
    console.error(
      "[email:verification] post-register send failed (account created; user can resend)",
      { email, error },
    );
  }
}
