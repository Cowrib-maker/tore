import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function storageKeyForHash(sha256: string): string {
  const hash = sha256.toLowerCase();
  return `artifacts/${hash.slice(0, 2)}/${hash}`;
}
