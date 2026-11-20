import { describe, expect, it } from "vitest";

import {
  authenticateSignedRequest,
  toAuthenticateDeps,
} from "@/application/use-cases/spell/authenticate-installation-request";
import { revokeSpellLicense, resetSpellTransferCooldown } from "@/application/use-cases/spell/admin-licenses";
import { activateLicense } from "@/application/use-cases/spell/activate-license";
import {
  SpellActivationEndReason,
  SpellActivationStatus,
  SpellAttemptKind,
  SpellAttemptOutcome,
  SpellEventType,
  SpellPlanCode,
} from "@/domain/spell/enums";
import { SPELL_TRANSFER_WARNING_MN } from "@/domain/spell/messages";
import { normalizeLicenseCode } from "@/domain/spell/license-code";
import { verifySpellEntitlementToken } from "@/infrastructure/spell/entitlement-token";
import {
  DAY,
  makeSpell,
  newDevice,
  rejection,
  signRequest,
} from "./helpers/spell-kit";

const HOUR = 3600_000;

describe("first activation & the license term", () => {
  it("starts the term at FIRST ACTIVATION, not at issuance", async () => {
    const s = makeSpell();
    const { license, code } = await s.issue({ plan: SpellPlanCode.SPELL_3M });
    expect(license.startsAt).toBeNull();
    expect(license.expiresAt).toBeNull();
    expect(license.redeemed).toBe(false);
    expect(license.redeemBy).toBe(new Date(s.t0.getTime() + 90 * DAY).toISOString());

    const later = new Date(s.t0.getTime() + 40 * DAY);
    const grant = await s.activate(newDevice(), code, { now: later });

    expect(grant.status).toBe("ACTIVATED");
    expect(grant.license.startsAt).toBe(later.toISOString());
    expect(grant.license.expiresAt).toBe("2027-02-14T09:00:00.000Z"); // 2026-11-14 + 3 months
    const stored = s.mem.state.licenses.get(license.id)!;
    expect(stored.startsAt).toEqual(later);
    expect(stored.expiresAt).toEqual(new Date("2027-02-14T09:00:00.000Z"));
  });

  it("issues a verifiable signed token bounded by the 24h offline cap and returns server policy", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const grant = await s.activate(newDevice(), code, { now: s.t0 });
    const { payload } = await verifySpellEntitlementToken(grant.token, s.tokenIssuer.publicJwks(), s.t0);
    expect(payload.act).toBe(grant.activationId);
    expect(new Date(grant.tokenValidUntil).getTime() - s.t0.getTime()).toBe(24 * HOUR);
    expect(new Date(grant.refreshAfter).getTime() - s.t0.getTime()).toBe(12 * HOUR);
    expect(grant.policy).toEqual({ refreshIntervalSeconds: 12 * 3600, maxOfflineSeconds: 24 * 3600 });
    expect(grant.serverTime).toBe(s.t0.toISOString());
  });

  it("refuses to activate after redeemBy", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const atDeadline = new Date(s.t0.getTime() + 90 * DAY);
    const r = await rejection(s.activate(newDevice(), code, { now: atDeadline }));
    expect(r.code).toBe("LICENSE_REDEEM_WINDOW_CLOSED");
    const justBefore = new Date(atDeadline.getTime() - 1000);
    await expect(s.activate(newDevice(), code, { now: justBefore })).resolves.toMatchObject({ status: "ACTIVATED" });
  });

  it("honours a configured redeemBy period", async () => {
    const s = makeSpell({ redeemByDays: 7 });
    const { code, license } = await s.issue();
    expect(license.redeemBy).toBe(new Date(s.t0.getTime() + 7 * DAY).toISOString());
    const r = await rejection(s.activate(newDevice(), code, { now: new Date(s.t0.getTime() + 8 * DAY) }));
    expect(r.code).toBe("LICENSE_REDEEM_WINDOW_CLOSED");
  });

  it("rejects an expired license for activation and validation, with the token capped at expiry", async () => {
    const s = makeSpell();
    const { code } = await s.issue({ plan: SpellPlanCode.SPELL_1M });
    const dev = newDevice();
    const g = await s.activate(dev, code, { now: s.t0 });
    // Near the end the token is capped at license expiry, not now+24h.
    const nearEnd = new Date(Date.parse(g.license.expiresAt) - 2 * HOUR);
    const v = await s.validate(dev, g.activationId, nearEnd);
    expect(new Date(v.tokenValidUntil).toISOString()).toBe(g.license.expiresAt);

    const expired = new Date(g.license.expiresAt);
    expect((await rejection(s.validate(dev, g.activationId, expired))).code).toBe("LICENSE_EXPIRED");
    expect((await rejection(s.activate(newDevice(), code, { now: expired }))).code).toBe("LICENSE_EXPIRED");
  });

  it("accepts the code as users type it (lowercase, spaces, with or without the TSPL prefix)", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const typed = code.toLowerCase().replaceAll("-", " ");
    await expect(s.activate(newDevice(), typed, { now: s.t0 })).resolves.toMatchObject({ status: "ACTIVATED" });
  });
});

describe("code validation, brute force and uniform errors", () => {
  it("returns the same error for unknown, malformed and bad-checksum codes", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const flipped = code.slice(0, -1) + (code.endsWith("0") ? "1" : "0");
    // A well-formed, checksum-valid code that does not exist:
    const unknown = (() => {
      const probe = "ABCDEFGHJKMNPQRSTVWXYZ0";
      return probe + "0"; // checksum may not match; use helper below for a valid one
    })();
    void unknown;
    const results = await Promise.all(
      ["garbage", flipped, "", "TSPL-0000-0000-0000-0000-0000-0000"].map((c) =>
        rejection(s.activate(newDevice(), c, { now: s.t0 })),
      ),
    );
    for (const r of results) {
      expect(r.code).toBe("LICENSE_CODE_INVALID");
      expect((r.error as Error).message).toBe("License code is not valid.");
    }
  });

  it("returns LICENSE_CODE_INVALID for a perfectly formed but unissued code", async () => {
    const s = makeSpell();
    await s.issue();
    const { generateCanonicalLicenseCode, formatLicenseCode } = await import("@/domain/spell/license-code");
    const fake = formatLicenseCode(generateCanonicalLicenseCode((n) => new Uint8Array(n).fill(7)));
    expect(normalizeLicenseCode(fake).ok).toBe(true);
    expect((await rejection(s.activate(newDevice(), fake, { now: s.t0 }))).code).toBe("LICENSE_CODE_INVALID");
  });

  it("locks out an IP and an installation after repeated failures, then recovers after the window", async () => {
    const s = makeSpell({ maxFailedCodeAttempts: 3, failedCodeAttemptWindowSeconds: 600 });
    const { code } = await s.issue();
    const ipHash = "ip-hash-1";
    const dev = newDevice();
    for (let i = 0; i < 3; i++) {
      expect((await rejection(s.activate(dev, "nope", { now: s.t0, ipHash }))).code).toBe("LICENSE_CODE_INVALID");
    }
    // Even the CORRECT code is refused while locked out: no free oracle.
    const locked = await rejection(s.activate(dev, code, { now: s.t0, ipHash }));
    expect(locked.code).toBe("TOO_MANY_ATTEMPTS");
    // Same IP, different device, still locked.
    expect((await rejection(s.activate(newDevice(), code, { now: s.t0, ipHash }))).code).toBe("TOO_MANY_ATTEMPTS");
    // Same device, different IP, still locked.
    expect((await rejection(s.activate(dev, code, { now: s.t0, ipHash: "other-ip" }))).code).toBe("TOO_MANY_ATTEMPTS");
    // A different device on a different IP is unaffected.
    await expect(s.activate(newDevice(), code, { now: s.t0, ipHash: "clean-ip" })).resolves.toMatchObject({ status: "ACTIVATED" });
    // Recovers after the window (a second license, since the first is now taken).
    const second = await s.issue();
    const after = new Date(s.t0.getTime() + 601_000);
    await expect(s.activate(dev, second.code, { now: after, ipHash })).resolves.toMatchObject({ status: "ACTIVATED" });
    const outcomes = s.mem.state.attempts.map((a) => a.outcome);
    expect(outcomes).toContain(SpellAttemptOutcome.RATE_LIMITED);
    expect(outcomes.filter((o) => o === SpellAttemptOutcome.INVALID_CODE)).toHaveLength(3);
  });

  it("rejects a revoked license", async () => {
    const s = makeSpell();
    const { code, license } = await s.issue();
    await revokeSpellLicense(s.admin, license.id, "chargeback", s.deps, s.t0);
    expect((await rejection(s.activate(newDevice(), code, { now: s.t0 }))).code).toBe("LICENSE_REVOKED");
  });
});

describe("device transfer", () => {
  async function activeOnA() {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const A = newDevice();
    const gA = await s.activate(A, code, { now: s.t0 });
    return { s, code, license, A, gA };
  }

  it("is idempotent for the computer that already holds the license", async () => {
    const { s, code, A, gA, license } = await activeOnA();
    const again = await s.activate(A, code, { now: new Date(s.t0.getTime() + HOUR) });
    expect(again.status).toBe("ALREADY_ACTIVE");
    expect(again.activationId).toBe(gA.activationId);
    expect([...s.mem.state.activations.values()].filter((a) => a.licenseId === license.id)).toHaveLength(1);
    // Term clock does not restart.
    expect(again.license.startsAt).toBe(gA.license.startsAt);
  });

  it("does NOT transfer without explicit confirmation; returns the mandated warning and changes nothing", async () => {
    const { s, code, gA, license } = await activeOnA();
    const B = newDevice();
    const before = JSON.stringify([...s.mem.state.activations.values()]);

    const r = await rejection(s.activate(B, code, { now: new Date(s.t0.getTime() + DAY) }));
    expect(r.code).toBe("TRANSFER_CONFIRMATION_REQUIRED");
    expect((r.error as { statusCode: number }).statusCode).toBe(409);
    expect(r.details).toMatchObject({
      warning: SPELL_TRANSFER_WARNING_MN,
      replacesActivationId: gA.activationId,
      currentDevice: { platform: "WINDOWS" },
    });
    expect(SPELL_TRANSFER_WARNING_MN).toBe(
      "Энэ license одоогоор өөр компьютерт идэвхтэй байна. Шинэ компьютерт шилжүүлбэл өмнөх компьютер дээр ашиглах эрх хүчингүй болно.",
    );
    expect(JSON.stringify([...s.mem.state.activations.values()])).toBe(before);
    expect(s.activeCount(license.id)).toBe(1);
    // The rejected computer was not even registered.
    expect(await s.mem.installationRepository.findByThumbprint(B.thumbprint)).toBeNull();
  });

  it("transfers on explicit confirmation: old DEACTIVATED/TRANSFERRED, new ACTIVE, fresh token, event recorded", async () => {
    const { s, code, A, gA, license } = await activeOnA();
    const B = newDevice();
    const at = new Date(s.t0.getTime() + 2 * DAY);

    const gB = await s.activate(B, code, { now: at, confirm: gA.activationId });

    expect(gB.status).toBe("TRANSFERRED");
    expect(gB.activationId).not.toBe(gA.activationId);
    const { payload } = await verifySpellEntitlementToken(gB.token, s.tokenIssuer.publicJwks(), at);
    expect(payload.inst).toBe(B.thumbprint);
    expect(payload.act).toBe(gB.activationId);
    // Term is unchanged by a transfer.
    expect(gB.license.expiresAt).toBe(gA.license.expiresAt);

    const oldRow = s.mem.state.activations.get(gA.activationId)!;
    expect(oldRow.status).toBe(SpellActivationStatus.DEACTIVATED);
    expect(oldRow.endReason).toBe(SpellActivationEndReason.TRANSFERRED);
    expect(oldRow.supersededByActivationId).toBe(gB.activationId);
    const newRow = s.mem.state.activations.get(gB.activationId)!;
    expect(newRow.status).toBe(SpellActivationStatus.ACTIVE);
    expect(newRow.transferredFromActivationId).toBe(gA.activationId);
    expect(s.activeCount(license.id)).toBe(1);

    const ev = s.mem.state.events.filter((e) => e.type === SpellEventType.ACTIVATION_TRANSFERRED);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ licenseId: license.id, activationId: gB.activationId, actorType: "DEVICE" });
    expect(ev[0]!.metadata).toMatchObject({ fromActivationId: gA.activationId });
    void A;
  });

  it("the OLD computer fails on its next validation; the NEW one validates", async () => {
    const { s, code, A, gA } = await activeOnA();
    const B = newDevice();
    // Both validate fine before the transfer.
    await expect(s.validate(A, gA.activationId, new Date(s.t0.getTime() + HOUR))).resolves.toMatchObject({ status: "VALID" });

    const at = new Date(s.t0.getTime() + 2 * HOUR);
    const gB = await s.activate(B, code, { now: at, confirm: gA.activationId });

    const old = await rejection(s.validate(A, gA.activationId, new Date(at.getTime() + 1000)));
    expect(old.code).toBe("ACTIVATION_NOT_ACTIVE");
    expect(old.details).toMatchObject({ status: "DEACTIVATED", endReason: "TRANSFERRED" });
    await expect(s.validate(B, gB.activationId, new Date(at.getTime() + 1000))).resolves.toMatchObject({ status: "VALID" });
  });

  it("a stale or wrong confirmation cannot evict a computer the user never saw", async () => {
    const { s, code, gA } = await activeOnA();
    const B = newDevice();
    const C = newDevice();
    const wrong = await rejection(s.activate(B, code, { now: s.t0, confirm: "some-other-activation" }));
    expect(wrong.code).toBe("TRANSFER_CONFIRMATION_REQUIRED");

    // B confirms against A; later C holds the license (after cooldown) and B retries with the stale id.
    const t1 = new Date(s.t0.getTime() + HOUR);
    const gB = await s.activate(B, code, { now: t1, confirm: gA.activationId });
    const t2 = new Date(t1.getTime() + 31 * DAY);
    const gC = await s.activate(C, code, { now: t2, confirm: gB.activationId });
    const stale = await rejection(s.activate(newDevice(), code, { now: new Date(t2.getTime() + 31 * DAY), confirm: gB.activationId }));
    expect(stale.code).toBe("TRANSFER_CONFIRMATION_REQUIRED");
    expect((stale.details as { replacesActivationId: string }).replacesActivationId).toBe(gC.activationId);
  });

  it("is atomic: if issuing the token fails, nothing changes and the old computer stays active", async () => {
    const { s, code, A, gA, license } = await activeOnA();
    const original = s.deps.tokenIssuer;
    s.deps.tokenIssuer = { issue: async () => { throw new Error("signing key unavailable"); } };
    const B = newDevice();
    await expect(s.activate(B, code, { now: new Date(s.t0.getTime() + DAY), confirm: gA.activationId })).rejects.toThrow("signing key unavailable");
    s.deps.tokenIssuer = original;

    expect(s.activeCount(license.id)).toBe(1);
    expect(s.mem.state.activations.get(gA.activationId)!.status).toBe(SpellActivationStatus.ACTIVE);
    expect(s.mem.state.events.some((e) => e.type === SpellEventType.ACTIVATION_TRANSFERRED)).toBe(false);
    expect(s.mem.state.licenses.get(license.id)!.lastDeviceChangeAt).toBeNull();
    await expect(s.validate(A, gA.activationId, new Date(s.t0.getTime() + DAY))).resolves.toMatchObject({ status: "VALID" });
  });

  it("many computers racing for one license can never produce two ACTIVE activations", async () => {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const devices = Array.from({ length: 25 }, () => newDevice());
    const results = await Promise.allSettled(devices.map((d) => s.activate(d, code, { now: s.t0 })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed.every((f) => f.reason.code === "TRANSFER_CONFIRMATION_REQUIRED")).toBe(true);
    expect(s.activeCount(license.id)).toBe(1);
    expect(s.mem.state.events.filter((e) => e.type === SpellEventType.LICENSE_FIRST_ACTIVATED)).toHaveLength(1);
  });
});

describe("transfer cooldown", () => {
  async function setup() {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const A = newDevice();
    const gA = await s.activate(A, code, { now: s.t0 });
    return { s, code, license, A, gA };
  }

  it("the first move is free; a second move within 30 days is blocked even when confirmed", async () => {
    const { s, code, gA } = await setup();
    const B = newDevice();
    const t1 = new Date(s.t0.getTime() + DAY);
    const gB = await s.activate(B, code, { now: t1, confirm: gA.activationId });

    const C = newDevice();
    const t2 = new Date(t1.getTime() + 10 * DAY);
    const blocked = await rejection(s.activate(C, code, { now: t2, confirm: gB.activationId }));
    expect(blocked.code).toBe("TRANSFER_COOLDOWN_ACTIVE");
    expect((blocked.details as { transferAvailableAt: string }).transferAvailableAt).toBe(new Date(t1.getTime() + 30 * DAY).toISOString());
    expect(s.mem.state.activations.get(gB.activationId)!.status).toBe("ACTIVE");
    // No confirmation prompt is shown when the move cannot happen anyway.
    expect((await rejection(s.activate(C, code, { now: t2 }))).code).toBe("TRANSFER_COOLDOWN_ACTIVE");
  });

  it("opens exactly 30 days after the last device change", async () => {
    const { s, code, gA } = await setup();
    const t1 = new Date(s.t0.getTime() + DAY);
    const gB = await s.activate(newDevice(), code, { now: t1, confirm: gA.activationId });
    const edge = new Date(t1.getTime() + 30 * DAY);
    const C = newDevice();
    expect((await rejection(s.activate(C, code, { now: new Date(edge.getTime() - 1000), confirm: gB.activationId }))).code).toBe("TRANSFER_COOLDOWN_ACTIVE");
    await expect(s.activate(C, code, { now: edge, confirm: gB.activationId })).resolves.toMatchObject({ status: "TRANSFERRED" });
  });

  it("the cooldown length is configurable server-side", async () => {
    const s = makeSpell({ transferCooldownDays: 2 });
    const { code } = await s.issue();
    const gA = await s.activate(newDevice(), code, { now: s.t0 });
    const t1 = new Date(s.t0.getTime() + DAY);
    const gB = await s.activate(newDevice(), code, { now: t1, confirm: gA.activationId });
    expect((await rejection(s.activate(newDevice(), code, { now: new Date(t1.getTime() + DAY), confirm: gB.activationId }))).code).toBe("TRANSFER_COOLDOWN_ACTIVE");
    await expect(s.activate(newDevice(), code, { now: new Date(t1.getTime() + 2 * DAY), confirm: gB.activationId })).resolves.toMatchObject({ status: "TRANSFERRED" });
  });

  it("an ADMIN override lifts the cooldown and is recorded in the immutable event log and AuditLog", async () => {
    const { s, code, license, gA } = await setup();
    const t1 = new Date(s.t0.getTime() + DAY);
    const gB = await s.activate(newDevice(), code, { now: t1, confirm: gA.activationId });
    const C = newDevice();
    const t2 = new Date(t1.getTime() + DAY);
    expect((await rejection(s.activate(C, code, { now: t2, confirm: gB.activationId }))).code).toBe("TRANSFER_COOLDOWN_ACTIVE");

    await resetSpellTransferCooldown(s.admin, license.id, "hardware failure, ticket #42", s.deps, t2);
    await expect(s.activate(C, code, { now: t2, confirm: gB.activationId })).resolves.toMatchObject({ status: "TRANSFERRED" });

    const ev = s.mem.state.events.find((e) => e.type === SpellEventType.TRANSFER_COOLDOWN_OVERRIDDEN)!;
    expect(ev).toMatchObject({ actorType: "ADMIN", actorUserId: s.admin.userId });
    expect(ev.metadata).toMatchObject({ reason: "hardware failure, ticket #42" });
    expect(s.auditCalls.some((c) => (c.metadata as Record<string, unknown>)?.spellAction === "TRANSFER_COOLDOWN_OVERRIDDEN")).toBe(true);
  });

  it("deactivating first and then activating elsewhere does NOT bypass the cooldown", async () => {
    const { s, code, A, gA } = await setup();
    const t1 = new Date(s.t0.getTime() + DAY);
    const B = newDevice();
    const gB = await s.activate(B, code, { now: t1, confirm: gA.activationId });
    await s.deactivate(B, gB.activationId, new Date(t1.getTime() + HOUR));
    const C = newDevice();
    const blocked = await rejection(s.activate(C, code, { now: new Date(t1.getTime() + 2 * HOUR) }));
    expect(blocked.code).toBe("TRANSFER_COOLDOWN_ACTIVE");
    void A;
  });

  it("a computer may re-activate its own released license at any time", async () => {
    const { s, code, license, A, gA } = await setup();
    await s.deactivate(A, gA.activationId, new Date(s.t0.getTime() + HOUR));
    const again = await s.activate(A, code, { now: new Date(s.t0.getTime() + 2 * HOUR) });
    expect(again.status).toBe("ACTIVATED");
    expect(again.activationId).not.toBe(gA.activationId);
    expect(s.activeCount(license.id)).toBe(1);
    expect(s.mem.state.licenses.get(license.id)!.lastDeviceChangeAt).toBeNull();
  });
});

describe("validation, deactivation and revocation", () => {
  it("validation issues a fresh token each time and records last validation", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const A = newDevice();
    const g = await s.activate(A, code, { now: s.t0 });
    const t = new Date(s.t0.getTime() + 12 * HOUR);
    const v = await s.validate(A, g.activationId, t);
    expect(v.token).not.toBe(g.token);
    expect(s.mem.state.activations.get(g.activationId)!.lastValidatedAt).toEqual(t);
    expect(new Date(v.tokenValidUntil).getTime() - t.getTime()).toBe(24 * HOUR);
  });

  it("another computer cannot validate (or deactivate) someone else's activation", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const A = newDevice();
    const g = await s.activate(A, code, { now: s.t0 });
    // Make B a known installation holding a different license.
    const other = await s.issue();
    const B = newDevice();
    await s.activate(B, other.code, { now: s.t0 });
    const v = await rejection(s.validate(B, g.activationId, s.t0));
    expect(v.code).toBe("ACTIVATION_NOT_ACTIVE");
    expect(v.details).toBeUndefined();
    expect((await rejection(s.deactivate(B, g.activationId, s.t0))).code).toBe("ACTIVATION_NOT_ACTIVE");
    expect((await rejection(s.validate(B, "does-not-exist", s.t0))).code).toBe("ACTIVATION_NOT_ACTIVE");
  });

  it("an unregistered installation cannot validate", async () => {
    const s = makeSpell();
    const r = await rejection(s.validate(newDevice(), "x", s.t0));
    expect(r.code).toBe("INSTALLATION_UNKNOWN");
  });

  it("revoking a license ends its activation immediately and validation fails", async () => {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const A = newDevice();
    const g = await s.activate(A, code, { now: s.t0 });
    const at = new Date(s.t0.getTime() + HOUR);
    await expect(revokeSpellLicense(s.admin, license.id, "fraud", s.deps, at)).resolves.toEqual({ revoked: true });

    const row = s.mem.state.activations.get(g.activationId)!;
    expect(row.status).toBe(SpellActivationStatus.REVOKED);
    expect(row.endReason).toBe(SpellActivationEndReason.LICENSE_REVOKED);
    const r = await rejection(s.validate(A, g.activationId, at));
    expect(r.code).toBe("ACTIVATION_NOT_ACTIVE");
    expect(r.details).toMatchObject({ status: "REVOKED", endReason: "LICENSE_REVOKED" });
    // Idempotent.
    await expect(revokeSpellLicense(s.admin, license.id, "again", s.deps, at)).resolves.toEqual({ revoked: false });
    const types = s.mem.state.events.map((e) => e.type);
    expect(types.filter((t) => t === SpellEventType.LICENSE_REVOKED)).toHaveLength(1);
    expect(types).toContain(SpellEventType.ACTIVATION_REVOKED);
  });

  it("a computer can release its own activation (idempotent), freeing the license", async () => {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const A = newDevice();
    const g = await s.activate(A, code, { now: s.t0 });
    await expect(s.deactivate(A, g.activationId, s.t0)).resolves.toEqual({ deactivated: true });
    await expect(s.deactivate(A, g.activationId, s.t0)).resolves.toEqual({ deactivated: false });
    expect(s.activeCount(license.id)).toBe(0);
    expect(s.mem.state.activations.get(g.activationId)!.endReason).toBe("USER_DEACTIVATED");
    expect((await rejection(s.validate(A, g.activationId, s.t0))).code).toBe("ACTIVATION_NOT_ACTIVE");
  });

  it("a revoked installation can neither validate nor activate", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const A = newDevice();
    const g = await s.activate(A, code, { now: s.t0 });
    const inst = (await s.mem.installationRepository.findByThumbprint(A.thumbprint))!;
    await s.mem.installationRepository.revoke(inst.id, s.t0);
    expect((await rejection(s.validate(A, g.activationId, s.t0))).code).toBe("INSTALLATION_REVOKED");
    expect((await rejection(s.activate(A, code, { now: s.t0 }))).code).toBe("INSTALLATION_REVOKED");
  });
});

describe("signed device requests", () => {
  const path = "/api/spell/v1/validations";

  async function auth(s: ReturnType<typeof makeSpell>, req: ReturnType<typeof signRequest>, now: Date, opts = {}) {
    return authenticateSignedRequest(req, toAuthenticateDeps(s.deps), SpellAttemptKind.VALIDATE, opts, now);
  }

  async function registered() {
    const s = makeSpell();
    const { code } = await s.issue();
    const dev = newDevice();
    await s.activate(dev, code, { now: s.t0 });
    return { s, dev };
  }

  it("accepts a correctly signed request", async () => {
    const { s, dev } = await registered();
    const now = new Date(s.t0.getTime() + 1000);
    const a = await auth(s, signRequest(dev, { path, body: { activationId: "x" }, now }), now);
    expect(a.thumbprint).toBe(dev.thumbprint);
    expect(a.installation).not.toBeNull();
  });

  it("rejects replays of the same request", async () => {
    const { s, dev } = await registered();
    const now = new Date(s.t0.getTime() + 1000);
    const req = signRequest(dev, { path, body: {}, now });
    await auth(s, req, now);
    expect((await rejection(auth(s, req, now))).code).toBe("REQUEST_REPLAYED");
  });

  it("enforces the clock window in both directions", async () => {
    const { s, dev } = await registered();
    const now = new Date(s.t0.getTime() + 1000);
    for (const skew of [-301, 301]) {
      const stamped = new Date(now.getTime() + skew * 1000);
      const r = await rejection(auth(s, signRequest(dev, { path, body: {}, now: stamped }), now));
      expect(r.code).toBe("REQUEST_TIMESTAMP_INVALID");
    }
    await expect(auth(s, signRequest(dev, { path, body: {}, now: new Date(now.getTime() - 299_000) }), now)).resolves.toBeTruthy();
  });

  it("rejects a tampered body, another path, another method, or another device's key", async () => {
    const { s, dev } = await registered();
    const now = new Date(s.t0.getTime() + 1000);
    const good = signRequest(dev, { path, body: { activationId: "a" }, now });
    const cases = [
      { ...good, rawBody: JSON.stringify({ activationId: "b" }) },
      { ...good, path: "/api/spell/v1/deactivations" },
      { ...good, method: "PUT" },
      signRequest(newDevice(), { path, body: { activationId: "a" }, now }), // unknown installation
    ];
    const codes = [];
    for (const c of cases) codes.push((await rejection(auth(s, c, now))).code);
    expect(codes).toEqual(["REQUEST_SIGNATURE_INVALID", "REQUEST_SIGNATURE_INVALID", "REQUEST_SIGNATURE_INVALID", "INSTALLATION_UNKNOWN"]);
    // Header claims dev's thumbprint but is signed by another key.
    const impostor = newDevice();
    const forged = signRequest(impostor, { path, body: {}, now });
    forged.headers.installation = dev.thumbprint;
    expect((await rejection(auth(s, forged, now))).code).toBe("REQUEST_SIGNATURE_INVALID");
  });

  it("does not consume a nonce for an unauthenticated request", async () => {
    const { s, dev } = await registered();
    const now = new Date(s.t0.getTime() + 1000);
    const nonce = "AAAAAAAAAAAAAAAAAAAAAAAA";
    const forged = signRequest(newDevice(), { path, body: {}, now, nonce });
    forged.headers.installation = dev.thumbprint;
    await rejection(auth(s, forged, now));
    await expect(auth(s, signRequest(dev, { path, body: {}, now, nonce }), now)).resolves.toBeTruthy();
  });

  it("rejects malformed headers and missing material", async () => {
    const { s, dev } = await registered();
    const now = new Date(s.t0.getTime() + 1000);
    const good = signRequest(dev, { path, body: {}, now });
    for (const patch of [
      { installation: null }, { timestamp: null }, { timestamp: "12abc" }, { nonce: "short" }, { nonce: null }, { signature: null }, { signature: "***" },
    ]) {
      const bad = { ...good, headers: { ...good.headers, ...patch } };
      expect((await rejection(auth(s, bad, now))).code).toBe("REQUEST_SIGNATURE_INVALID");
    }
  });

  it("activation: the body key must hash to the claimed thumbprint and a malformed key is refused", async () => {
    const s = makeSpell();
    const a = newDevice();
    const b = newDevice();
    const now = s.t0;
    const req = signRequest(a, { path: "/api/spell/v1/activations", body: {}, now });
    const r1 = await rejection(auth(s, req, now, { registerPublicKey: b.publicKey }));
    expect(r1.code).toBe("REQUEST_SIGNATURE_INVALID");
    const r2 = await rejection(auth(s, signRequest(a, { path, body: {}, now }), now, { registerPublicKey: "not-a-key" }));
    expect(r2.code).toBe("REQUEST_SIGNATURE_INVALID");
  });
});

describe("no secret ever reaches the audit trail, attempts, or logs", () => {
  it("events, attempts and AuditLog metadata contain no code, hash or ciphertext", async () => {
    const spies: string[] = [];
    const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    for (const k of Object.keys(orig) as (keyof typeof orig)[]) {
      console[k] = (...args: unknown[]) => { spies.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
    }
    try {
      const s = makeSpell({ maxFailedCodeAttempts: 2 });
      const owner = s.addUser("owner-1");
      const { code, license } = await s.issue({ ownerUserId: owner.userId });
      const canonical = (normalizeLicenseCode(code) as { ok: true; canonical: string }).canonical;
      const stored = s.mem.state.licenses.get(license.id)!;
      const A = newDevice();
      const g = await s.activate(A, code, { now: s.t0, machineHint: "hw-hint-123", ipHash: "ip1" });
      await s.activate(newDevice(), code, { now: s.t0 }).catch(() => undefined);
      await s.activate(newDevice(), "totally-wrong", { now: s.t0, ipHash: "ip2" }).catch(() => undefined);
      await s.validate(A, g.activationId, s.t0);
      await revokeSpellLicense(s.admin, license.id, "reason text", s.deps, s.t0);

      const haystack = JSON.stringify({
        events: s.mem.state.events,
        attempts: s.mem.state.attempts,
        audit: s.auditCalls,
        installations: [...s.mem.state.installations.values()],
        logs: spies,
      });
      for (const secret of [
        canonical,
        code,
        stored.codeHash,
        Buffer.from(stored.codeCiphertext).toString("base64"),
        Buffer.from(stored.codeCiphertext).toString("hex"),
        "hw-hint-123",
      ]) {
        expect(haystack).not.toContain(secret);
      }
    } finally {
      Object.assign(console, orig);
    }
  });

  it("activating via the use case directly never needs the plaintext after the fact", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    const dev = newDevice();
    const authed = await authenticateSignedRequest(
      signRequest(dev, { path: "/x", body: {}, now: s.t0 }),
      toAuthenticateDeps(s.deps),
      SpellAttemptKind.ACTIVATE,
      { registerPublicKey: dev.publicKey },
      s.t0,
    );
    await expect(
      activateLicense({ code, platform: "WINDOWS" as never, appVersion: "1", device: authed, ipHash: null }, s.deps, s.t0),
    ).resolves.toMatchObject({ status: "ACTIVATED" });
  });
});
