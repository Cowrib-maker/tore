/**
 * Founder / marketing demo accounts. Exact emails only — not a role grant.
 * These users may exercise paid TORE product surfaces without checkout.
 */
export const PLATFORM_DEMO_ACCOUNT_EMAILS = [
  "beadyduk@gmail.com",
  "e.dulguun@ymail.com",
] as const;

export const PLATFORM_DEMO_PROVIDER_INVOICE_ID = "platform-demo";

/** Display name in entitlement UI — not a catalog plan code. */
export const PLATFORM_DEMO_PLAN_NAME = "TORE Founder (demo)";

export const PLATFORM_DEMO_UNLIMITED_REMAINING = 9_999;

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlatformDemoEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const normalized = normalizeAccountEmail(email);
  return (PLATFORM_DEMO_ACCOUNT_EMAILS as readonly string[]).includes(
    normalized,
  );
}
