import { describe, expect, it } from "vitest";

import { verifyInstallerIdentity } from "@/domain/spell/installer-verify";

const HASH = "585391e7eb8d502c691ccee56c1e72ac87b8431baa1290bff0a3ec60c0a243f9";
const actual = { sha256: HASH, bytes: 111_335_692 };

describe("verifyInstallerIdentity", () => {
  it("passes when the hash matches, ignoring case (PowerShell prints upper-case)", () => {
    const r = verifyInstallerIdentity({ ...actual, sha256: HASH.toUpperCase() }, { SPELL_WINDOWS_INSTALLER_SHA256: HASH });
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.id === "SHA256")?.status).toBe("OK");
  });

  it("fails on a different hash", () => {
    const r = verifyInstallerIdentity(actual, { SPELL_WINDOWS_INSTALLER_SHA256: "a".repeat(64) });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "SHA256")?.status).toBe("MISMATCH");
  });

  it("never passes when no hash is configured (nothing to compare is a failure, not a pass)", () => {
    const r = verifyInstallerIdentity(actual, {});
    expect(r.ok).toBe(false);
    expect(r.checks[0]?.status).toBe("NOT_CONFIGURED");
  });

  it.each(["abc", "z".repeat(64), "a".repeat(63)])("rejects a malformed configured hash (%s)", (bad) => {
    const r = verifyInstallerIdentity(actual, { SPELL_WINDOWS_INSTALLER_SHA256: bad });
    expect(r.ok).toBe(false);
    expect(r.checks[0]?.status).toBe("INVALID");
  });

  it("checks the size only when configured, and fails on a mismatch even with a matching hash", () => {
    const env = { SPELL_WINDOWS_INSTALLER_SHA256: HASH };
    expect(verifyInstallerIdentity(actual, { ...env, SPELL_WINDOWS_INSTALLER_SIZE: "111335692" }).ok).toBe(true);
    const bad = verifyInstallerIdentity(actual, { ...env, SPELL_WINDOWS_INSTALLER_SIZE: "111335693" });
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.id === "SIZE")?.status).toBe("MISMATCH");
    expect(verifyInstallerIdentity(actual, { ...env, SPELL_WINDOWS_INSTALLER_SIZE: "-4" }).checks.find((c) => c.id === "SIZE")?.status).toBe("INVALID");
  });

  it("never echoes the configured or actual hash in a message", () => {
    const r = verifyInstallerIdentity(actual, { SPELL_WINDOWS_INSTALLER_SHA256: "b".repeat(64) });
    expect(JSON.stringify(r.checks)).not.toContain("b".repeat(64));
    expect(JSON.stringify(r.checks)).not.toContain(HASH);
  });
});
