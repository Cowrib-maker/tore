import { UserRole, UserStatus } from "@/domain/enums";

export const DASHBOARD_PATH: Record<UserRole, string> = {
  [UserRole.CLIENT]: "/client/dashboard",
  [UserRole.LAWYER]: "/lawyer/dashboard",
  [UserRole.ADMIN]: "/admin/dashboard",
};

export const ROLE_ROUTE_PREFIX: Record<UserRole, string> = {
  [UserRole.CLIENT]: "/client",
  [UserRole.LAWYER]: "/lawyer",
  [UserRole.ADMIN]: "/admin",
};

/** Shared authenticated product surfaces (all ACTIVE roles). */
export const SHARED_AUTHENTICATED_PREFIXES = ["/organizations"] as const;

export function getDashboardPath(role: UserRole): string {
  return DASHBOARD_PATH[role];
}

/** Canonical client Legal AI workspace. */
export const LEGAL_AI_PATH = "/legal-ai";

const LEGAL_AI_QUESTION_MAX = 800;

/**
 * Same-origin `/legal-ai` path only (optional `q`). Rejects protocol-relative
 * and external URLs so login cannot be used as an open redirect.
 */
export function safeLegalAiCallback(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (value.includes("://") || value.includes("\\")) {
    return null;
  }
  const [pathname, query] = value.split("?", 2);
  if (pathname !== LEGAL_AI_PATH) {
    return null;
  }
  if (query === undefined || query.length === 0) {
    return LEGAL_AI_PATH;
  }
  return `${LEGAL_AI_PATH}?${query}`;
}

export function legalAiHref(question?: string): string {
  const trimmed = question?.trim() ?? "";
  if (!trimmed) {
    return LEGAL_AI_PATH;
  }
  const clipped =
    trimmed.length > LEGAL_AI_QUESTION_MAX
      ? trimmed.slice(0, LEGAL_AI_QUESTION_MAX)
      : trimmed;
  return `${LEGAL_AI_PATH}?q=${encodeURIComponent(clipped)}`;
}

export function loginHrefForLegalAi(question?: string): string {
  return `/login?callbackUrl=${encodeURIComponent(legalAiHref(question))}`;
}

export function registerClientHrefForLegalAi(question?: string): string {
  return `/register/client?callbackUrl=${encodeURIComponent(legalAiHref(question))}`;
}

/** CLIENT may return to Legal AI; other roles always go to their dashboard. */
export function getPostAuthRedirect(
  role: UserRole,
  callbackUrl: unknown,
): string {
  if (role === UserRole.CLIENT) {
    const safe = safeLegalAiCallback(callbackUrl);
    if (safe) {
      return safe;
    }
  }
  return getDashboardPath(role);
}

/** True when pathname is exactly `prefix` or under `prefix/` (not `/lawyer` vs `/lawyers`). */
export function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isSharedAuthenticatedRoute(pathname: string): boolean {
  return SHARED_AUTHENTICATED_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );
}

/** Role app shells (`/client`, `/lawyer`, `/admin`) — excludes public `/lawyers`. */
export function isProtectedAppRoute(pathname: string): boolean {
  return (
    matchesRoutePrefix(pathname, ROLE_ROUTE_PREFIX[UserRole.CLIENT]) ||
    matchesRoutePrefix(pathname, ROLE_ROUTE_PREFIX[UserRole.LAWYER]) ||
    matchesRoutePrefix(pathname, ROLE_ROUTE_PREFIX[UserRole.ADMIN]) ||
    isSharedAuthenticatedRoute(pathname)
  );
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  if (role === UserRole.ADMIN) {
    return true;
  }

  if (isSharedAuthenticatedRoute(pathname)) {
    return true;
  }

  const prefix = ROLE_ROUTE_PREFIX[role];
  return pathname.startsWith(prefix);
}

export function isAccountUsable(status: UserStatus): boolean {
  return status === UserStatus.ACTIVE;
}

export function assertRole(
  actual: UserRole,
  allowed: UserRole[],
): boolean {
  return allowed.includes(actual);
}
