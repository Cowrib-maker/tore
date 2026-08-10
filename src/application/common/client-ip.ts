import { headers } from "next/headers";

/** Best-effort client IP from proxy headers (for rate limits / audit). */
export async function getClientIp(): Promise<string | undefined> {
  const headerStore = await headers();
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined
  );
}
