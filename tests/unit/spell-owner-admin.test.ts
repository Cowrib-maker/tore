import { describe, expect, it } from "vitest";

import {
  adminDeactivateSpellActivation,
  getSpellLicenseDetail,
  issueSpellLicense,
  listSpellLicenses,
  revokeSpellLicense,
  resetSpellTransferCooldown,
} from "@/application/use-cases/spell/admin-licenses";
import {
  deactivateOwnerLicense,
  listOwnerLicenses,
  revealLicenseCode,
} from "@/application/use-cases/spell/owner-licenses";
import { pruneSpellTransientData } from "@/application/use-cases/spell/prune-transient-data";
import { UserRole } from "@/domain/enums";
import { SpellEventType, SpellLicenseSource, SpellPlanCode } from "@/domain/spell/enums";
import { normalizeLicenseCode } from "@/domain/spell/license-code";
import { DAY, makeSpell, newDevice, rejection } from "./helpers/spell-kit";

describe("owner can retrieve their license code (and only the owner)", () => {
  it("reveals the exact issued code to the owner, with an audit event that omits the code", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const { code, license } = await s.issue({ ownerUserId: owner.userId });

    const revealed = await revealLicenseCode(owner, license.id, "iphash", s.deps, s.t0);
    expect(revealed.code).toBe(code);

    const ev = s.mem.state.events.find((e) => e.type === SpellEventType.LICENSE_CODE_REVEALED)!;
    expect(ev).toMatchObject({ licenseId: license.id, actorType: "USER", actorUserId: owner.userId, ipHash: "iphash" });
    expect(JSON.stringify(ev)).not.toContain(code);
    expect(JSON.stringify(ev)).not.toContain((normalizeLicenseCode(code) as { canonical: string }).canonical);
    expect(ev.metadata).toEqual({ codeEncKeyVersion: "e1" });
  });

  it("the revealed code activates a new computer after a valid transfer", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const { code, license } = await s.issue({ ownerUserId: owner.userId });
    const gA = await s.activate(newDevice(), code, { now: s.t0 });

    const reshown = (await revealLicenseCode(owner, license.id, null, s.deps, s.t0)).code;
    const gB = await s.activate(newDevice(), reshown, { now: new Date(s.t0.getTime() + DAY), confirm: gA.activationId });
    expect(gB.status).toBe("TRANSFERRED");
    expect(s.activeCount(license.id)).toBe(1);
  });

  it("other users, admins who are not the owner, and strangers get a plain 404 (no existence oracle)", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const intruder = s.addUser("intruder");
    const { license } = await s.issue({ ownerUserId: owner.userId });
    const unowned = await s.issue();

    for (const [actor, id] of [
      [intruder, license.id],
      [s.admin, license.id],
      [owner, unowned.license.id],
      [owner, "does-not-exist"],
    ] as const) {
      const r = await rejection(revealLicenseCode(actor, id, null, s.deps, s.t0));
      expect(r.code).toBe("NOT_FOUND");
    }
    expect(s.mem.state.events.some((e) => e.type === SpellEventType.LICENSE_CODE_REVEALED)).toBe(false);
  });

  it("fails closed: if the audit event cannot be written, no code is returned", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const { license } = await s.issue({ ownerUserId: owner.userId });
    const original = s.deps.unitOfWork;
    s.deps.unitOfWork = { runInTransaction: async () => { throw new Error("db down"); } };
    await expect(revealLicenseCode(owner, license.id, null, s.deps, s.t0)).rejects.toThrow("db down");
    s.deps.unitOfWork = original;
  });

  it("a corrupted ciphertext errors generically without leaking anything", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const { license } = await s.issue({ ownerUserId: owner.userId });
    const row = s.mem.state.licenses.get(license.id)!;
    const broken = Buffer.from(row.codeCiphertext);
    broken[20] ^= 0xff;
    row.codeCiphertext = broken;
    const r = await rejection(revealLicenseCode(owner, license.id, null, s.deps, s.t0));
    expect((r.error as Error).message).toBe("Spell ciphertext could not be authenticated");
  });

  it("lists only the owner's licenses with masked codes and the live activation", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const other = s.addUser("owner-2");
    const mine = await s.issue({ ownerUserId: owner.userId });
    await s.issue({ ownerUserId: other.userId });
    const A = newDevice();
    await s.activate(A, mine.code, { now: s.t0 });

    const list = await listOwnerLicenses(owner, s.deps, s.t0);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: mine.license.id,
      status: "ACTIVE",
      redeemed: true,
      activeActivation: { platform: "WINDOWS", status: "ACTIVE" },
      transferAvailableAt: null,
    });
    const json = JSON.stringify(list);
    expect(json).not.toContain(mine.code);
    expect(json).toContain(`••••-${(normalizeLicenseCode(mine.code) as { canonical: string }).canonical.slice(-4)}`);
    for (const forbidden of ["codeHash", "codeCiphertext", "codeEncKeyVersion", "codeHashKeyId"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("shows when a device change becomes possible again", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const { code, license } = await s.issue({ ownerUserId: owner.userId });
    const gA = await s.activate(newDevice(), code, { now: s.t0 });
    const t1 = new Date(s.t0.getTime() + DAY);
    await s.activate(newDevice(), code, { now: t1, confirm: gA.activationId });
    const [view] = await listOwnerLicenses(owner, s.deps, new Date(t1.getTime() + DAY));
    expect(view!.id).toBe(license.id);
    expect(view!.transferAvailableAt).toBe(new Date(t1.getTime() + 30 * DAY).toISOString());
  });

  it("the owner can release the license from the web; non-owners cannot", async () => {
    const s = makeSpell();
    const owner = s.addUser("owner-1");
    const intruder = s.addUser("intruder");
    const { code, license } = await s.issue({ ownerUserId: owner.userId });
    const A = newDevice();
    const g = await s.activate(A, code, { now: s.t0 });

    expect((await rejection(deactivateOwnerLicense(intruder, license.id, null, s.deps, s.t0))).code).toBe("NOT_FOUND");
    expect(s.activeCount(license.id)).toBe(1);

    await expect(deactivateOwnerLicense(owner, license.id, null, s.deps, s.t0)).resolves.toEqual({ deactivated: true });
    await expect(deactivateOwnerLicense(owner, license.id, null, s.deps, s.t0)).resolves.toEqual({ deactivated: false });
    expect((await rejection(s.validate(A, g.activationId, s.t0))).code).toBe("ACTIVATION_NOT_ACTIVE");
    expect(s.mem.state.events.find((e) => e.type === SpellEventType.ACTIVATION_DEACTIVATED)).toMatchObject({ actorType: "USER", actorUserId: owner.userId });
  });
});

describe("admin operations", () => {
  it("only ADMIN may issue, list, inspect, revoke, reset or force-deactivate", async () => {
    const s = makeSpell();
    const { license } = await s.issue();
    for (const role of [UserRole.CLIENT, UserRole.LAWYER]) {
      const actor = { userId: "u", role };
      const calls = [
        issueSpellLicense(actor, { planCode: SpellPlanCode.SPELL_1M }, s.deps),
        listSpellLicenses(actor, { limit: 10, offset: 0 }, s.deps),
        getSpellLicenseDetail(actor, license.id, s.deps),
        revokeSpellLicense(actor, license.id, "x", s.deps),
        resetSpellTransferCooldown(actor, license.id, "x", s.deps),
        adminDeactivateSpellActivation(actor, license.id, "x", s.deps),
      ];
      for (const call of calls) expect((await rejection(call)).code).toBe("FORBIDDEN");
    }
    expect(s.mem.state.licenses.get(license.id)!.status).toBe("ACTIVE");
  });

  it("issuing validates plan, owner and source, and snapshots the duration", async () => {
    const s = makeSpell();
    expect((await rejection(issueSpellLicense(s.admin, { planCode: "SPELL_99M" as never }, s.deps))).code).toBe("VALIDATION_ERROR");
    expect((await rejection(issueSpellLicense(s.admin, { planCode: SpellPlanCode.SPELL_1M, ownerUserId: "ghost" }, s.deps))).code).toBe("NOT_FOUND");
    expect((await rejection(issueSpellLicense(s.admin, { planCode: SpellPlanCode.SPELL_1M, source: SpellLicenseSource.PURCHASE }, s.deps))).code).toBe("VALIDATION_ERROR");

    for (const [plan, months] of [[SpellPlanCode.SPELL_1M, 1], [SpellPlanCode.SPELL_3M, 3], [SpellPlanCode.SPELL_6M, 6], [SpellPlanCode.SPELL_12M, 12]] as const) {
      const { license } = await s.issue({ plan });
      expect(s.mem.state.licenses.get(license.id)!.durationMonths).toBe(months);
    }
  });

  it("stores only a hash and ciphertext — never the plaintext code — and records issuance", async () => {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const canonical = (normalizeLicenseCode(code) as { canonical: string }).canonical;
    const row = s.mem.state.licenses.get(license.id)!;
    expect(JSON.stringify(row, (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("latin1") : v))).not.toContain(canonical);
    expect(row.codeHint).toBe(canonical.slice(-4));
    expect(row.codeEncKeyVersion).toBe("e1");
    expect(row.codeHashKeyId).toBe("h1");
    expect(row.issuedByUserId).toBe(s.admin.userId);
    const ev = s.mem.state.events.find((e) => e.type === SpellEventType.LICENSE_ISSUED)!;
    expect(JSON.stringify(ev)).not.toContain(canonical);
    expect(s.auditCalls[0]).toMatchObject({ action: "CREATE", entityType: "SpellLicense", entityId: license.id });
    expect(JSON.stringify(s.auditCalls)).not.toContain(canonical);
  });

  it("admin responses never expose code material", async () => {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const g = await s.activate(newDevice(), code, { now: s.t0 });
    await s.activate(newDevice(), code, { now: new Date(s.t0.getTime() + DAY), confirm: g.activationId });
    const detail = await getSpellLicenseDetail(s.admin, license.id, s.deps, s.t0);
    const list = await listSpellLicenses(s.admin, { limit: 10, offset: 0 }, s.deps, s.t0);
    const json = JSON.stringify({ detail, list });
    for (const forbidden of ["codeHash", "codeCiphertext", "codeEncKeyVersion", "codeHashKeyId", "publicKey", "keyThumbprint", "machineHint"]) {
      expect(json).not.toContain(forbidden);
    }
    expect(json).not.toContain(s.mem.state.licenses.get(license.id)!.codeHash);
    expect(detail.activations).toHaveLength(2);
    expect(detail.events.map((e) => e.type)).toContain("ACTIVATION_TRANSFERRED");
  });

  it("a failing AuditLog mirror never undoes the committed admin action", async () => {
    const s = makeSpell();
    const { license } = await s.issue();
    s.deps.auditLogRepository = { create: async () => { throw new Error("audit db down"); } };
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errors.push(a); };
    try {
      await expect(revokeSpellLicense(s.admin, license.id, "fraud", s.deps)).resolves.toEqual({ revoked: true });
    } finally {
      console.error = orig;
    }
    expect(s.mem.state.licenses.get(license.id)!.status).toBe("REVOKED");
    expect(s.mem.state.events.some((e) => e.type === SpellEventType.LICENSE_REVOKED)).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it("requires a reason for destructive actions, and returns 404 for unknown licenses", async () => {
    const s = makeSpell();
    const { license } = await s.issue();
    for (const bad of ["", "   ", undefined, 5]) {
      expect((await rejection(revokeSpellLicense(s.admin, license.id, bad, s.deps))).code).toBe("VALIDATION_ERROR");
    }
    expect((await rejection(revokeSpellLicense(s.admin, "nope", "r", s.deps))).code).toBe("NOT_FOUND");
    expect((await rejection(resetSpellTransferCooldown(s.admin, "nope", "r", s.deps))).code).toBe("NOT_FOUND");
    expect((await rejection(adminDeactivateSpellActivation(s.admin, "nope", "r", s.deps))).code).toBe("NOT_FOUND");
    expect((await rejection(getSpellLicenseDetail(s.admin, "nope", s.deps))).code).toBe("NOT_FOUND");
  });

  it("admin force-deactivate frees the license but is not a transfer (cooldown unchanged)", async () => {
    const s = makeSpell();
    const { code, license } = await s.issue();
    const A = newDevice();
    const g = await s.activate(A, code, { now: s.t0 });
    await expect(adminDeactivateSpellActivation(s.admin, license.id, "lost laptop", s.deps, s.t0)).resolves.toEqual({ deactivated: true });
    expect(s.mem.state.activations.get(g.activationId)!.endReason).toBe("ADMIN_DEACTIVATED");
    // New computer takes it with no prompt (nothing active) and no cooldown yet.
    await expect(s.activate(newDevice(), code, { now: s.t0 })).resolves.toMatchObject({ status: "ACTIVATED" });
    await expect(adminDeactivateSpellActivation(s.admin, license.id, "x", s.deps, s.t0)).resolves.toEqual({ deactivated: true });
  });

  it("clamps list pagination", async () => {
    const s = makeSpell();
    await s.issue();
    const r = await listSpellLicenses(s.admin, { limit: 10_000, offset: -5 }, s.deps);
    expect(r.items).toHaveLength(1);
  });
});

describe("housekeeping", () => {
  it("prunes expired nonces and old attempts but never audit events", async () => {
    const s = makeSpell();
    const { code } = await s.issue();
    await s.activate(newDevice(), code, { now: s.t0 });
    await s.activate(newDevice(), "bad", { now: s.t0 }).catch(() => undefined);
    const eventsBefore = s.mem.state.events.length;
    const later = new Date(s.t0.getTime() + 60 * DAY);
    const result = await pruneSpellTransientData(s.deps, later);
    expect(result.attemptsDeleted).toBeGreaterThan(0);
    expect(result.noncesDeleted).toBeGreaterThan(0);
    expect(s.mem.state.attempts).toHaveLength(0);
    expect(s.mem.state.events).toHaveLength(eventsBefore);
  });
});
