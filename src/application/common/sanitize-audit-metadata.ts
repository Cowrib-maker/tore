/**
 * Defense-in-depth redaction for audit-log metadata shown to admins.
 * No current writer stores secrets in `metadata` (grep-verified: only
 * status/decision/field/value/id references), but the audit viewer is a
 * new read surface over years of historical writes this code did not
 * control — a key that only *looks* like a secret is still redacted.
 * Keys ending in "Id" are always kept (foreign-key references such as
 * credentialId/lawyerProfileId are never secrets).
 */
const SENSITIVE_KEY_PATTERN =
  /password|secret|token|apikey|api_key|privatekey|private_key|authorization/i;

function isSensitiveKey(key: string): boolean {
  if (/id$/i.test(key)) return false;
  return SENSITIVE_KEY_PATTERN.test(key);
}

const REDACTED = "[REDACTED]";

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    result[key] = isSensitiveKey(key) ? REDACTED : sanitizeValue(value);
  }
  return result;
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return metadata;
  return sanitizeObject(metadata);
}
