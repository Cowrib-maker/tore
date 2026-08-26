export const SESSION_REPLACED_CODE = "SESSION_REPLACED";

export const SESSION_REPLACED_MESSAGE =
  "Таны бүртгэлээр өөр төхөөрөмжөөс нэвтэрсэн тул энэ төхөөрөмжийн сесс дуусгавар боллоо.";

export const SESSION_REPLACED_HINT =
  "Шинээр нэвтрэхийн тулд дахин нэвтэрнэ үү.";

export const SESSION_REPLACED_LOGIN_REASON = "other_device";

export function sessionReplacedLoginPath(): string {
  return `/login?reason=${SESSION_REPLACED_LOGIN_REASON}`;
}

export function isSessionReplacedLoginReason(value: unknown): boolean {
  return value === SESSION_REPLACED_LOGIN_REASON;
}
