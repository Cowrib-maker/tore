import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { UserRole, UserStatus } from "@/domain/enums";
import { canAccessRoute, getDashboardPath } from "@/domain/services/rbac";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { negotiateLocale } from "@/i18n/negotiate";
import { edgeAuthConfig } from "@/infrastructure/auth/auth.edge.config";

const { auth } = NextAuth(edgeAuthConfig);

function attachLocaleCookie(
  req: { cookies: { get: (name: string) => { value: string } | undefined }; headers: Headers },
  response: NextResponse,
): NextResponse {
  const existing = req.cookies.get(LOCALE_COOKIE)?.value;
  if (!isLocale(existing)) {
    const locale = negotiateLocale(req.headers.get("accept-language"));
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return response;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role as UserRole | undefined;
  const status = req.auth?.user?.status;

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/verify-email");

  const isProtectedRoute =
    pathname.startsWith("/client") ||
    pathname.startsWith("/lawyer") ||
    pathname.startsWith("/admin");

  let response: NextResponse | undefined;

  if (isProtectedRoute && !isLoggedIn) {
    response = NextResponse.redirect(new URL("/login", req.nextUrl));
  } else if (
    isProtectedRoute &&
    isLoggedIn &&
    status &&
    status !== UserStatus.ACTIVE
  ) {
    response = NextResponse.redirect(
      new URL("/login?error=account_inactive", req.nextUrl),
    );
  } else if (isAuthRoute && isLoggedIn && role && status === UserStatus.ACTIVE) {
    response = NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
  } else if (isProtectedRoute && isLoggedIn && role) {
    if (!canAccessRoute(role, pathname)) {
      response = NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
    }
  }

  const hasLocale = isLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  if (!response && hasLocale) {
    return undefined;
  }

  return attachLocaleCookie(req, response ?? NextResponse.next());
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|brand/).*)"],
};
