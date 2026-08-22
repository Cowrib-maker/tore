import { createHash } from "node:crypto";

/** SHA-256 of `pepper:ip`. Never persist the raw IP. */
export function hashIpAddress(
  ip: string | null | undefined,
  pepper: string,
): string | null {
  if (!ip || !pepper) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(`${pepper}:${trimmed}`).digest("hex");
}
