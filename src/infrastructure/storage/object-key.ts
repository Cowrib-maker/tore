import { randomUUID } from "node:crypto";

import type { FilePurpose } from "@/domain/ports/file-storage";
import { ValidationError } from "@/domain/errors/domain-error";

const UNSAFE_SEGMENT = /[^a-zA-Z0-9._-]+/g;

export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || "file";
  const cleaned = base.replace(UNSAFE_SEGMENT, "_").slice(0, 120);
  return cleaned.length > 0 ? cleaned : "file";
}

export function buildObjectKey(
  purpose: FilePurpose,
  ownerId: string,
  fileName: string,
): string {
  const owner = ownerId.replace(UNSAFE_SEGMENT, "_").slice(0, 64);
  if (!owner) {
    throw new ValidationError("Storage owner id is required");
  }
  const safeName = sanitizeFileName(fileName);
  return `${purpose}/${owner}/${randomUUID()}-${safeName}`;
}

export function assertSafeStorageKey(key: string): void {
  if (
    !key ||
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0")
  ) {
    throw new ValidationError("Invalid storage key");
  }
}
