import { UserRole } from "@/domain/enums";
import { isSessionReplacedLoginReason } from "@/domain/services/active-session-constants";
import {
  getPostAuthRedirect,
  safeLegalAiCallback,
} from "@/domain/services/rbac";

export type EmailVerificationPageStatus =
  | "pending"
  | "success"
  | "invalid"
  | "unavailable";

export type EmailVerificationPageModel =
  | {
      status: "pending";
      email: string | null;
      callbackUrl: string | null;
      sent: boolean;
    }
  | {
      status: "success";
      email: string;
      continueHref: string;
    }
  | {
      status: "invalid";
      email: string | null;
    }
  | {
      status: "unavailable";
      email: string | null;
    };

export function normalizeVerificationEmail(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email.includes("@") || email.length > 254) return null;
  return email;
}

export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function buildEmailVerificationPendingPath(params: {
  email: string;
  callbackUrl?: unknown;
  sent?: boolean;
}): string {
  const url = new URL("/verify-email", "https://tore.invalid");
  url.searchParams.set("email", params.email.trim().toLowerCase());
  const safe = safeLegalAiCallback(params.callbackUrl);
  if (safe) {
    url.searchParams.set("callbackUrl", safe);
  }
  if (params.sent) {
    url.searchParams.set("sent", "1");
  }
  return `${url.pathname}${url.search}`;
}

/**
 * After the email link succeeds the user still signs in.
 * CLIENT may keep a Legal AI callback; other roles use default login.
 */
export function loginHrefAfterEmailVerification(
  role: UserRole,
  callbackUrl?: unknown,
): string {
  if (role === UserRole.CLIENT) {
    const safe = safeLegalAiCallback(callbackUrl);
    if (safe) {
      return `/login?callbackUrl=${encodeURIComponent(safe)}`;
    }
  }
  return "/login";
}

export function destinationAfterVerifiedLogin(
  role: UserRole,
  callbackUrl?: unknown,
): string {
  return getPostAuthRedirect(role, callbackUrl);
}

export function pendingEmailVerificationPageModel(
  email: string | null,
  callbackUrl: string | null,
  sent = false,
): EmailVerificationPageModel {
  return { status: "pending", email, callbackUrl, sent };
}

export function successEmailVerificationPageModel(
  email: string,
  role: UserRole,
  callbackUrl: string | null,
): EmailVerificationPageModel {
  return {
    status: "success",
    email,
    continueHref: loginHrefAfterEmailVerification(role, callbackUrl),
  };
}

export function invalidEmailVerificationPageModel(
  email: string | null,
): EmailVerificationPageModel {
  return { status: "invalid", email };
}

export function unavailableEmailVerificationPageModel(
  email: string | null,
): EmailVerificationPageModel {
  return { status: "unavailable", email };
}

/**
 * Credentials may succeed for an unverified account; the login action must
 * not complete a session until emailVerified is set.
 */
export function resolvePostCredentialLogin(
  user: { emailVerified: Date | null } | null,
): "ok" | "unverified" | "unavailable" {
  if (!user) return "unavailable";
  if (!user.emailVerified) return "unverified";
  return "ok";
}

export function isSessionBouncingAuthRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password")
  );
}

/**
 * Logged-in users are redirected away from /login, except the other-device
 * message which must remain visible even if the stale JWT cookie is still present.
 */
export function shouldBounceAuthenticatedFromAuthRoute(
  pathname: string,
  reason: string | null,
): boolean {
  if (!isSessionBouncingAuthRoute(pathname)) {
    return false;
  }
  if (pathname === "/login" && isSessionReplacedLoginReason(reason)) {
    return false;
  }
  return true;
}
