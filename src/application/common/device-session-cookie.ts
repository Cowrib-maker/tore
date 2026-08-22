export const DEVICE_SESSION_COOKIE = "tore_device_session";
export const DEVICE_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function deviceSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: DEVICE_SESSION_COOKIE_MAX_AGE,
  };
}
