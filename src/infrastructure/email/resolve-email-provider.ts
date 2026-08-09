import type { Env } from "@/lib/env";

export type ResolvedEmailProvider = "console" | "resend" | "smtp";

/**
 * Resolve provider without changing call sites:
 * - Explicit EMAIL_PROVIDER=console|resend|smtp always wins
 * - Local/dev/test default (`auto`): ConsoleEmailSender (no real sends)
 * - Production `auto`: Resend when RESEND_API_KEY is set, else SMTP if SMTP_HOST set
 */
export function resolveEmailProvider(
  config: Pick<
    Env,
    | "EMAIL_PROVIDER"
    | "NODE_ENV"
    | "RESEND_API_KEY"
    | "SMTP_HOST"
  >,
): ResolvedEmailProvider {
  if (
    config.EMAIL_PROVIDER === "console" ||
    config.EMAIL_PROVIDER === "resend" ||
    config.EMAIL_PROVIDER === "smtp"
  ) {
    return config.EMAIL_PROVIDER;
  }

  // auto
  if (config.NODE_ENV === "development" || config.NODE_ENV === "test") {
    return "console";
  }

  if (config.RESEND_API_KEY) {
    return "resend";
  }
  if (config.SMTP_HOST) {
    return "smtp";
  }

  throw new Error(
    "Production email requires RESEND_API_KEY (preferred) or SMTP_HOST. Or set EMAIL_PROVIDER explicitly.",
  );
}
