import type { LegalLocator } from "../knowledge/schema";
import type { CanonicalPinpoint } from "./types";

const PINPOINT_FIELDS = [
  "book",
  "part",
  "chapter",
  "section",
  "article",
  "paragraph",
  "subparagraph",
  "item",
  "clause",
  "annex",
] as const;

export function locatorToPinpoint(
  locator: LegalLocator | null,
): CanonicalPinpoint {
  if (!locator) {
    return {};
  }
  const pinpoint: CanonicalPinpoint = {};
  for (const field of PINPOINT_FIELDS) {
    const value = locator[field];
    if (value) {
      pinpoint[field] = value;
    }
  }
  return pinpoint;
}

export function mergePinpoint(
  base: CanonicalPinpoint,
  extra: CanonicalPinpoint,
): CanonicalPinpoint {
  return { ...base, ...extra };
}

export function pinpointKey(pinpoint: CanonicalPinpoint): string {
  const parts: string[] = [];
  for (const field of PINPOINT_FIELDS) {
    const value = pinpoint[field];
    if (value) {
      parts.push(`${field}:${value}`);
    }
  }
  return parts.join("/");
}

/**
 * Dotted article pinpoint (`17`, `17.1`, `17.1.2`, `17.1.2.1`).
 * Letter items are omitted from the dotted form.
 */
export function dottedPinpoint(pinpoint: CanonicalPinpoint): string | null {
  if (!pinpoint.article) {
    return null;
  }
  const parts = [pinpoint.article];
  if (pinpoint.paragraph) {
    parts.push(pinpoint.paragraph);
  }
  if (pinpoint.subparagraph) {
    parts.push(pinpoint.subparagraph);
  }
  if (pinpoint.item && /^\d+$/.test(pinpoint.item)) {
    parts.push(pinpoint.item);
  }
  return parts.join(".");
}

export function parseDottedPinpoint(text: string): CanonicalPinpoint | null {
  const match = text.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }
  const pinpoint: CanonicalPinpoint = { article: match[1] };
  if (match[2]) {
    pinpoint.paragraph = match[2];
  }
  if (match[3]) {
    pinpoint.subparagraph = match[3];
  }
  if (match[4]) {
    pinpoint.item = match[4];
  }
  return pinpoint;
}
