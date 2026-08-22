/**
 * Application download URLs for stored objects.
 * Sensitive purposes always go through /api/files (session authz) —
 * never permanent public CDN or storage URLs.
 */

import {
  FILE_PURPOSES,
  type FilePurpose,
} from "@/domain/ports/file-storage";
import { assertSafeStorageKey } from "@/infrastructure/storage/object-key";

const SENSITIVE_PURPOSES = new Set<FilePurpose>([
  "lawyer-credential",
  "contract",
  "evidence",
  "message-attachment",
  "legal-ai-document",
]);

export function isSensitiveFilePurpose(purpose: string): boolean {
  return SENSITIVE_PURPOSES.has(purpose as FilePurpose);
}

export function isSensitiveStorageKey(key: string): boolean {
  assertSafeStorageKey(key);
  const purpose = key.split("/")[0] ?? "";
  return isSensitiveFilePurpose(purpose);
}

/** Stable app-relative path authorized by GET /api/files/[...key]. */
export function buildAppFilePath(key: string, appUrl?: string): string {
  assertSafeStorageKey(key);
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const path = `/api/files/${encoded}`;
  if (!appUrl) return path;
  return `${appUrl.replace(/\/$/, "")}${path}`;
}

export function assertKnownFilePurpose(purpose: string): purpose is FilePurpose {
  return (FILE_PURPOSES as readonly string[]).includes(purpose);
}

/**
 * Public, unauthenticated path for homepage marketing images — served by a
 * dedicated route that never touches session auth, unlike /api/files.
 */
export function buildPublicHomepageImagePath(key: string, appUrl?: string): string {
  assertSafeStorageKey(key);
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const path = `/api/homepage-images/${encoded}`;
  if (!appUrl) return path;
  return `${appUrl.replace(/\/$/, "")}${path}`;
}
