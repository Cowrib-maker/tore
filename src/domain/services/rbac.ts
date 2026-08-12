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
