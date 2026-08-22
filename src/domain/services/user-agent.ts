const UA_MAX = 256;

export function truncateUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const cleaned = userAgent.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, UA_MAX);
}

/** Coarse display label only — not a fingerprint and not unique. */
export function summarizeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${browser} · ${os}`;
}
