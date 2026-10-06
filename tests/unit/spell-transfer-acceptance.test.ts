import { describe, expect, it } from "vitest";

import {
  resetSpellTransferCooldown,
} from "@/application/use-cases/spell/admin-licenses";
import { verifySpellEntitlementToken } from "@/infrastructure/spell/entitlement-token";
import { SpellPlanCode } from "@/domain/spell/enums";
import { DAY, makeSpell, newDevice, rejection } from "./helpers/spell-kit";

const HOUR = 3_600_000;

/** Approved transfer policy: first move free; then 30 days from the previous successful transfer. */
async function licenseOnA() {
  const s = makeSpell();
  const { code, license } = await s.issue();
  const A = newDevice();
  const gA = await s.activate(A, code, { now: s.t0 });
  return { s, code, license, A, gA };
}

describe("transfer policy acceptance", () => {
  it("the FIRST transfer is allowed immediately (same instant as initial activation)", async () => {
    const { s, code, gA } = await licenseOnA();
    const gB = await s.activate(newDevice(), code, { now: s.t0, confirm: gA.activationId });
    expect(gB.status).toBe("TRANSFERRED");
  });

  it("a SECOND transfer attempted immediately after the first is rejected, even when confirmed", async () => {
    const { s, code, gA } = await licenseOnA();
    const gB = await s.activate(newDevice(), code, { now: s.t0, confirm: gA.activationId });
    const r = await rejection(s.activate(newDevice(), code, { now: s.t0, confirm: gB.activationId }));
    expect(r.code).toBe("TRANSFER_COOLDOWN_ACTIVE");
    expect((r.details as { transferAvailableAt: string }).transferAvailableAt).toBe(new Date(s.t0.getTime() + 30 * DAY).toISOString());
  });

  it("the cooldown is measured from the previous successful transfer, not from initial activation", async () => {
    const s = makeSpell();
    const { code } = await s.issue({ plan: SpellPlanCode.SPELL_12M });
    const gA = await s.activate(newDevice(), code, { now: s.t0 });
    const firstMove = new Date(s.t0.getTime() + 100 * DAY); // long after initial activation
    const gB = await s.activate(newDevice(), code, { now: firstMove, confirm: gA.activationId });
    expect(gB.status).toBe("TRANSFERRED");
    const tooSoon = new Date(firstMove.getTime() + 30 * DAY - 1000);
    expect((await rejection(s.activate(newDevice(), code, { now: tooSoon, confirm: gB.activationId }))).code).toBe("TRANSFER_COOLDOWN_ACTIVE");
  });

  it("a transfer is allowed once 30 days have passed since the previous transfer", async () => {
    const { s, code, gA } = await licenseOnA();
    const gB = await s.activate(newDevice(), code, { now: s.t0, confirm: gA.activationId });
    const later = new Date(s.t0.getTime() + 30 * DAY);
    const gC = await s.activate(newDevice(), code, { now: later, confirm: gB.activationId });
    expect(gC.status).toBe("TRANSFERRED");
    expect(s.activeCount(gC.license.id)).toBe(1);
  });

  it("deactivation does not bypass the cooldown (device or web path)", async () => {
    const { s, code, gA } = await licenseOnA();
    const B = newDevice();
    const gB = await s.activate(B, code, { now: s.t0, confirm: gA.activationId });
    await s.deactivate(B, gB.activationId, new Date(s.t0.getTime() + HOUR));
    const r = await rejection(s.activate(newDevice(), code, { now: new Date(s.t0.getTime() + 2 * HOUR) }));
    expect(r.code).toBe("TRANSFER_COOLDOWN_ACTIVE");
  });

  it("ADMIN override lifts the cooldown, and every transfer and override is in the immutable log", async () => {
    const { s, code, license, gA } = await licenseOnA();
    const gB = await s.activate(newDevice(), code, { now: s.t0, confirm: gA.activationId });
    const C = newDevice();
    const t = new Date(s.t0.getTime() + DAY);
    expect((await rejection(s.activate(C, code, { now: t, confirm: gB.activationId }))).code).toBe("TRANSFER_COOLDOWN_ACTIVE");
    await resetSpellTransferCooldown(s.admin, license.id, "support ticket 7", s.deps, t);
    await s.activate(C, code, { now: t, confirm: gB.activationId });

    const types = s.mem.state.events.map((e) => e.type);
    expect(types.filter((x) => x === "ACTIVATION_TRANSFERRED")).toHaveLength(2);
    expect(types.filter((x) => x === "TRANSFER_COOLDOWN_OVERRIDDEN")).toHaveLength(1);
    // After an override-assisted transfer the cooldown restarts.
    expect((await rejection(s.activate(newDevice(), code, { now: new Date(t.getTime() + HOUR), confirm: (await s.mem.activationRepository.findActiveByLicenseId(license.id))!.id }))).code).toBe("TRANSFER_COOLDOWN_ACTIVE");
  });
});

describe("old device after transfer: online vs offline", () => {
  it("ONLINE: the old device's next validation fails with ACTIVATION_NOT_ACTIVE / TRANSFERRED", async () => {
    const { s, code, A, gA } = await licenseOnA();
    const at = new Date(s.t0.getTime() + HOUR);
    await s.activate(newDevice(), code, { now: at, confirm: gA.activationId });
    const r = await rejection(s.validate(A, gA.activationId, new Date(at.getTime() + 1000)));
    expect(r.code).toBe("ACTIVATION_NOT_ACTIVE");
    expect(r.details).toMatchObject({ status: "DEACTIVATED", endReason: "TRANSFERRED" });
  });

  it("OFFLINE: the old device's last token is valid for at most 24h from issue, never longer", async () => {
    const { s, code, A, gA } = await licenseOnA();
    const issuedAt = new Date(s.t0.getTime() + 6 * HOUR);
    const lastOnline = await s.validate(A, gA.activationId, issuedAt); // old device's last successful validation
    await s.activate(newDevice(), code, { now: new Date(issuedAt.getTime() + HOUR), confirm: gA.activationId });

    const jwks = s.tokenIssuer.publicJwks();
    const validUntil = new Date(lastOnline.tokenValidUntil);
    expect(validUntil.getTime() - issuedAt.getTime()).toBe(24 * HOUR); // the cap
    // Locally verifiable (offline) right up to the cap …
    await expect(verifySpellEntitlementToken(lastOnline.token, jwks, new Date(validUntil.getTime() - 1000))).resolves.toBeTruthy();
    // … and dead after it, with no server contact needed.
    await expect(verifySpellEntitlementToken(lastOnline.token, jwks, new Date(validUntil.getTime() + 1000))).rejects.toThrow();
  });

  it("no token is ever issued with more than 24h of offline validity (activate and validate)", async () => {
    const { s, code, A, gA } = await licenseOnA();
    const grants = [gA, await s.validate(A, gA.activationId, new Date(s.t0.getTime() + 12 * HOUR))];
    const B = newDevice();
    grants.push(await s.activate(B, code, { now: new Date(s.t0.getTime() + 13 * HOUR), confirm: gA.activationId }));
    for (const g of grants) {
      const { payload } = await verifySpellEntitlementToken(g.token, s.tokenIssuer.publicJwks(), new Date(g.serverTime));
      expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(24 * 3600);
      expect(new Date(g.tokenValidUntil).getTime() - new Date(g.serverTime).getTime()).toBeLessThanOrEqual(24 * HOUR);
    }
  });
});
