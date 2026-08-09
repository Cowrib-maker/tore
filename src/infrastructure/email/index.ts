import type { EmailSender } from "@/domain/ports/email-sender";
import { ConsoleEmailSender } from "@/infrastructure/email/console-email-sender";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import {
  resolveEmailProvider,
  type ResolvedEmailProvider,
} from "@/infrastructure/email/resolve-email-provider";
import { SmtpEmailSender } from "@/infrastructure/email/smtp-email-sender";
import { env, type Env } from "@/lib/env";

export type { ResolvedEmailProvider };
export { resolveEmailProvider };

let cached: EmailSender | null = null;

/**
 * Composition-root factory. Application code depends on EmailSender only.
 */
export function createEmailSender(config: Env = env): EmailSender {
  const provider = resolveEmailProvider(config);
  const from = config.EMAIL_FROM;

  if (provider === "resend") {
    if (!config.RESEND_API_KEY) {
      throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY");
    }
    console.info("[email] Using ResendEmailSender");
    return new ResendEmailSender(config.RESEND_API_KEY, from);
  }

  if (provider === "smtp") {
    if (!config.SMTP_HOST) {
      throw new Error("EMAIL_PROVIDER=smtp requires SMTP_HOST");
    }
    console.info("[email] Using SmtpEmailSender", { host: config.SMTP_HOST });
    return new SmtpEmailSender({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: Boolean(config.SMTP_SECURE),
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      defaultFrom: from,
    });
  }

  console.warn(
    "[email] Using ConsoleEmailSender — verification/reset links are logged, not delivered.",
  );
  return new ConsoleEmailSender();
}

export function getEmailSender(): EmailSender {
  if (!cached) {
    cached = createEmailSender();
  }
  return cached;
}

/** Test helper — resets singleton between cases. */
export function resetEmailSenderForTests(): void {
  cached = null;
}
