import { matchesRoutePrefix } from "@/domain/services/rbac";

/**
 * Internal destinations a billing flow may send a lawyer back to. A prefix
 * list (not "any internal path") so the return parameter can never point at
 * an account, auth or API route. `/lawyer/billing` is excluded on purpose:
 * returning to the page that issued the return would loop.
 */
const RETURN_PREFIXES = ["/legal-ai", "/lawyer", "/matters"] as const;
const BILLING_PATH = "/lawyer/billing";

/**
 * True when any path segment is a dot-segment ("." / "..") or hides a slash or
 * backslash, in raw, percent-encoded (%2e, %2f, %5c) or double-encoded form.
 * Browsers and routers resolve these, which would let an allowed prefix such as
 * `/lawyer` climb out to an account, auth or API route. Malformed encoding is
 * treated as unsafe.
 */
function hasTraversalSegment(pathname: string): boolean {
  for (const segment of pathname.split("/")) {
    let current = segment;
    // Up to three decode rounds covers %2e and %252e style double encoding.
    for (let round = 0; round < 3; round += 1) {
      if (current === "." || current === ".." || current.includes("/") || current.includes("\\")) {
        return true;
      }
      let next: string;
      try {
        next = decodeURIComponent(current);
      } catch {
        return true;
      }
      if (next === current) break;
      current = next;
    }
    if (current === "." || current === ".." || current.includes("/") || current.includes("\\")) return true;
  }
  return false;
}

/**
 * Validates a user-supplied "return to" value. Returns the same-origin path
 * (with query) when it is safe, otherwise `null`. Rejects absolute and
 * protocol-relative URLs, backslashes, control characters and any path that
 * decodes to one of those, and any dot-segment / encoded-slash traversal, so it
 * cannot be used as an open redirect or to climb out of the allowed prefixes.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || value.includes("://")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  // Before any prefix check: "/lawyer/../login" must not pass as a "/lawyer" path.
  if (hasTraversalSegment(pathname)) return null;
  if (matchesRoutePrefix(pathname, BILLING_PATH)) return null;
  if (!RETURN_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix))) return null;
  return value;
}

/** `/lawyer/billing` link that remembers where the lawyer came from (omitted when `returnTo` is not a safe internal path). */
export function lawyerBillingHref(returnTo?: string | null, hash?: "history"): string {
  const safe = safeReturnPath(returnTo);
  const query = safe ? `?returnTo=${encodeURIComponent(safe)}` : "";
  return `${BILLING_PATH}${query}${hash ? `#${hash}` : ""}`;
}
