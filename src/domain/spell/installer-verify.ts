/**
 * Identity check of a Windows installer against the configured release metadata (SPELL_WINDOWS_INSTALLER_SHA256 / _SIZE).
 *
 * The server publishes a SHA-256 (licence page, signed update notice) but never reads the installer object itself. Whoever uploads or promotes an
 * installer therefore needs ONE objective check that "the bytes that will be served" are "the bytes that were built and hashed in CI". This module is
 * the pure comparison; `scripts/spell-verify-installer.ts` feeds it either a local file or the object behind SPELL_INSTALLER_STORAGE_KEY.
 * It never fabricates a pass: a missing/invalid configured hash is a FAILURE, not "nothing to compare".
 */
import { SPELL_RELEASE_ENV } from "@/domain/spell/update";

export type InstallerIdentity = { sha256: string; bytes: number };

export type InstallerCheck = {
  id: "CONFIGURED_SHA256" | "SHA256" | "SIZE";
  status: "OK" | "MISMATCH" | "NOT_CONFIGURED" | "INVALID";
  message: string;
};

const HEX64 = /^[a-f0-9]{64}$/;

export function verifyInstallerIdentity(
  actual: InstallerIdentity,
  env: Record<string, string | undefined> = process.env,
): { ok: boolean; checks: InstallerCheck[] } {
  const checks: InstallerCheck[] = [];
  const expectedHash = env[SPELL_RELEASE_ENV.sha256]?.trim().toLowerCase();
  const actualHash = actual.sha256.trim().toLowerCase();

  if (!expectedHash) {
    checks.push({ id: "CONFIGURED_SHA256", status: "NOT_CONFIGURED", message: `${SPELL_RELEASE_ENV.sha256} is not set: there is nothing to verify against` });
  } else if (!HEX64.test(expectedHash)) {
    checks.push({ id: "CONFIGURED_SHA256", status: "INVALID", message: `${SPELL_RELEASE_ENV.sha256} is not a 64-character hex SHA-256` });
  } else {
    checks.push({ id: "CONFIGURED_SHA256", status: "OK", message: "configured SHA-256 is well-formed" });
    checks.push(
      expectedHash === actualHash
        ? { id: "SHA256", status: "OK", message: "the installer's SHA-256 equals the configured value" }
        : { id: "SHA256", status: "MISMATCH", message: "the installer's SHA-256 does NOT equal the configured value: do not publish" },
    );
  }

  const rawSize = env[SPELL_RELEASE_ENV.size]?.trim();
  if (rawSize) {
    const expectedSize = Number(rawSize);
    if (!Number.isInteger(expectedSize) || expectedSize <= 0) {
      checks.push({ id: "SIZE", status: "INVALID", message: `${SPELL_RELEASE_ENV.size} is not a positive integer` });
    } else {
      checks.push(
        expectedSize === actual.bytes
          ? { id: "SIZE", status: "OK", message: "the installer's size equals the configured value" }
          : { id: "SIZE", status: "MISMATCH", message: `the installer is ${actual.bytes} bytes but ${expectedSize} is configured` },
      );
    }
  }

  return { ok: checks.every((c) => c.status === "OK") && checks.some((c) => c.id === "SHA256"), checks };
}
