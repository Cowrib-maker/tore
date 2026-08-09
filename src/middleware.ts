import NextAuth from "next-auth";

import { UserRole } from "@/domain/enums";
import { canAccessRoute, getDashboardPath } from "@/domain/services/rbac";
import { edgeAuthConfig } from "@/infrastructure/auth/auth.edge.config";

const { auth } = NextAuth(edgeAuthConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role as UserRole | undefined;

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password");

  const isProtectedRoute =
    pathname.startsWith("/client") ||
    pathname.startsWith("/lawyer") ||
    pathname.startsWith("/admin");

  if (isProtectedRoute && !isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthRoute && isLoggedIn && role) {
    return Response.redirect(new URL(getDashboardPath(role), req.nextUrl));
  }

  if (isProtectedRoute && isLoggedIn && role) {
    if (!canAccessRoute(role, pathname)) {
      return Response.redirect(new URL(getDashboardPath(role), req.nextUrl));
    }
  }

  return undefined;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
