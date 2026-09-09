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

/**
 * Public, unauthenticated path for an ATTORNEY's public marketplace profile
 * photo — served by a dedicated route that re-checks isLawyerPubliclyListed
 * per request (prosecutor/judge/other-lawyer photos are never reachable
 * here). Callers must only use this for a profile already confirmed public
 * — e.g. getPublicLawyerProfile's result — never for an arbitrary user.
 */
export function buildPublicProfilePhotoPath(key: string, appUrl?: string): string {
  assertSafeStorageKey(key);
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const path = `/api/profile-photos/${encoded}`;
  if (!appUrl) return path;
  return `${appUrl.replace(/\/$/, "")}${path}`;
}

/**
 * `User.image` holds either an external OAuth avatar URL or a stored
 * "profile-photo/..." key from our own upload feature — resolve either
 * shape to a displayable URL. `forOwner` picks the authenticated
 * /api/files route (self/admin); omit it for the public marketplace route,
 * which re-checks public eligibility per request.
 */
export function resolveProfilePhotoUrl(
  image: string | null,
  options?: { forOwner?: boolean; appUrl?: string },
): string | null {
  if (!image) return null;
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }
  if (!image.startsWith("profile-photo/")) return null;
  return options?.forOwner
    ? buildAppFilePath(image, options.appUrl)
    : buildPublicProfilePhotoPath(image, options?.appUrl);
}
