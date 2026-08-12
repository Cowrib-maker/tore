import type { ActiveContextSelection } from "@/application/common/actor-context";
import { ActiveContextType } from "@/domain/enums";

/** Serialize selection hint for the cookie (not an authz grant). */
export function serializeActiveContextSelection(
  selection: ActiveContextSelection,
): string {
  if (selection.type === ActiveContextType.PERSONAL) {
    return "personal";
  }
  return `org:${selection.organizationId}`;
}

/**
 * Parse cookie/UI selection. Rejects forged or malformed values.
 * Does not authorize membership — callers must resolve server-side.
 */
export function parseActiveContextSelection(
  raw: string | null | undefined,
): ActiveContextSelection | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (value === "" || value === "personal") {
    return value === "personal"
      ? { type: ActiveContextType.PERSONAL }
      : null;
  }
  if (!value.startsWith("org:")) {
    return null;
  }
  const organizationId = value.slice(4).trim();
  // Reject empty, path-like, or obviously forged payloads.
  if (
    organizationId.length < 8 ||
    organizationId.length > 64 ||
    !/^[a-zA-Z0-9_-]+$/.test(organizationId)
  ) {
    return null;
  }
  return {
    type: ActiveContextType.ORGANIZATION,
    organizationId,
  };
}
