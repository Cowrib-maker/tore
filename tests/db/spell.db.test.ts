import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { activateLicense } from "@/application/use-cases/spell/activate-license";
import {
  adminDeactivateSpellActivation,
  getSpellLicenseDetail,
  issueSpellLicense,
  revokeSpellLicense,
} from "@/application/use-cases/spell/admin-licenses";
import type { AuthenticatedInstallation } from "@/application/use-cases/spell/authenticate-installation-request";
import type { SpellAdminDeps } from "@/application/use-cases/spell/deps";
import type { SpellGrant } from "@/application/use-cases/spell/grant";
import { revealLicenseCode } from "@/application/use-cases/spell/owner-licenses";
import { validateActivation } from "@/application/use-cases/spell/validate-activation";
import { UserRole } from "@/domain/enums";
import { SpellPlanCode, SpellPlatform } from "@/domain/spell/enums";
import { prisma } from "@/infrastructure/database/prisma";
import { PrismaSpellUnitOfWork } from "@/infrastructure/database/prisma-spell-unit-of-work";
import { isRetryableSerializationFailure } from "@/infrastructure/database/serialization-retry";
import { Prisma } from "@/generated/prisma/client";
import { PrismaSpellActivationRepository } from "@/infrastructure/repositories/prisma-spell-activation-repository";
import { PrismaSpellLicenseEventRepository } from "@/infrastructure/repositories/prisma-spell-event-repository";
import {
  PrismaSpellAttemptRepository,
  PrismaSpellNonceRepository,
} from "@/infrastructure/repositories/prisma-spell-guard-repository";
import { PrismaSpellInstallationRepository } from "@/infrastructure/repositories/prisma-spell-installation-repository";
import { PrismaSpellLicenseRepository } from "@/infrastructure/repositories/prisma-spell-license-repository";
import { KeyRingSpellCodeVault } from "@/infrastructure/spell/code-vault";
import { JoseSpellTokenIssuer } from "@/infrastructure/spell/entitlement-token";
import { parseSpellConfig } from "@/infrastructure/spell/spell-config";
import { DEFAULT_SPELL_POLICY } from "@/domain/spell/policy";
import { newDevice, makeSpellEnv, type TestDevice } from "../unit/helpers/spell-kit";

const DAY = 86_400_000;
const T0 = new Date("2026-10-05T09:00:00.000Z");
const RACERS = 16;

let retries = 0;
const config = parseSpellConfig(makeSpellEnv());
const unitOfWork = new PrismaSpellUnitOfWork({
  maxAttempts: 8,
  baseDelayMs: 5,
  sleep: async (ms) => {
    retries++;
    await new Promise((r) => setTimeout(r, ms));
  },
});

const deps: SpellAdminDeps = {
  unitOfWork,
  repos: {
    licenseRepository: new PrismaSpellLicenseRepository(prisma),
    installationRepository: new PrismaSpellInstallationRepository(prisma),
    activationRepository: new PrismaSpellActivationRepository(prisma),
    eventRepository: new PrismaSpellLicenseEventRepository(prisma),
  },
  attemptRepository: new PrismaSpellAttemptRepository(prisma),
  nonceRepository: new PrismaSpellNonceRepository(prisma),
  vault: new KeyRingSpellCodeVault(config.codeHmacKeys, config.codeEncryptionKeys),
  tokenIssuer: new JoseSpellTokenIssuer(config.signing),
  policy: { ...DEFAULT_SPELL_POLICY },
  userRepository: {
    findById: async (id: string) =>
      (await prisma.user.findUnique({ where: { id } })) as never,
  },
  auditLogRepository: {
    create: async (input) => {
      await prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.action as never,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata as never,
        },
      });
      return {} as never;
    },
  },
  randomBytes: (n) => randomBytes(n),
};

let admin: { userId: string; role: UserRole };
const createdUsers: string[] = [];

async function makeUser(role: UserRole = UserRole.CLIENT) {
  const id = `spelltest_${randomUUID()}`;
  await prisma.user.create({
    data: { id, email: `${id}@spell-test.local`, role, status: "ACTIVE" },
  });
  createdUsers.push(id);
  return { userId: id, role };
}

beforeAll(async () => {
  // Fail loudly if the database was not migrated.
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'spell_activations'`;
  if (Number(rows[0]?.n) !== 1) {
    throw new Error("Spell tables are missing: run `prisma migrate deploy` against SPELL_TEST_DATABASE_URL first.");
  }
  admin = await makeUser(UserRole.ADMIN);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const principal = (d: TestDevice): AuthenticatedInstallation => ({
  thumbprint: d.thumbprint,
  publicKey: d.publicKey,
  installation: null,
});

async function issue(owner?: string, plan = SpellPlanCode.SPELL_3M) {
  return issueSpellLicense(admin, { planCode: plan, ownerUserId: owner }, deps, T0);
}

function activate(d: TestDevice, code: string, now: Date, confirm?: string) {
  return activateLicense(
    {
      code,
      platform: SpellPlatform.WINDOWS,
      appVersion: "1.0.0",
      confirmTransferOfActivationId: confirm ?? null,
      device: principal(d),
      ipHash: null,
    },
    deps,
    now,
  );
}

async function validate(d: TestDevice, activationId: string, now: Date) {
  const installation = await deps.repos.installationRepository.findByThumbprint(d.thumbprint);
  return validateActivation(
    { activationId, device: { ...principal(d), installation }, ipHash: null },
    deps,
    now,
  );
}

async function activeCount(licenseId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM spell_activations WHERE license_id = ${licenseId} AND status = 'ACTIVE'`;
  return Number(rows[0]!.n);
}

async function eventCount(licenseId: string, type: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM spell_license_events WHERE license_id = ${licenseId} AND type = ${type}::"SpellEventType"`;
  return Number(rows[0]!.n);
}

type Settled = PromiseSettledResult<SpellGrant>;
const fulfilled = (r: Settled[]) => r.filter((x): x is PromiseFulfilledResult<SpellGrant> => x.status === "fulfilled");
const rejectedCodes = (r: Settled[]) =>
  r.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => (x.reason as { code?: string }).code ?? `RAW:${String(x.reason)}`);

describe("database guarantees (constraints, triggers)", () => {
  async function rawLicense() {
    return prisma.spellLicense.create({
      data: {
        id: randomUUID(), planCode: "SPELL_1M", durationMonths: 1, source: "ADMIN_ISSUED",
        codeHash: randomUUID(), codeHashKeyId: "h1", codeCiphertext: Buffer.from("x"),
        codeEncKeyVersion: "e1", codeHint: "ABCD", redeemBy: new Date(T0.getTime() + DAY),
      },
    });
  }
  async function rawInstallation() {
    return prisma.spellInstallation.create({
      data: { keyThumbprint: randomUUID(), publicKey: "k", platform: "WINDOWS", appVersion: "1", firstSeenAt: T0, lastSeenAt: T0 },
    });
  }
  const activationData = (licenseId: string, installationId: string) => ({
    licenseId, installationId, status: "ACTIVE" as const, activatedAt: T0, lastValidatedAt: T0,
  });

  it("the partial unique index makes two ACTIVE activations per license impossible, even when bypassing all application code", async () => {
    const lic = await rawLicense();
    const [i1, i2] = [await rawInstallation(), await rawInstallation()];
    await prisma.spellActivation.create({ data: activationData(lic.id, i1.id) });
    await expect(prisma.spellActivation.create({ data: activationData(lic.id, i2.id) })).rejects.toMatchObject({ code: "P2002" });

    // Racing raw inserts: exactly one wins.
    const lic2 = await rawLicense();
    const installs = await Promise.all(Array.from({ length: 10 }, rawInstallation));
    const results = await Promise.allSettled(installs.map((i) => prisma.spellActivation.create({ data: activationData(lic2.id, i.id) })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await activeCount(lic2.id)).toBe(1);
  });

  it("an ended activation frees the slot (the index only constrains ACTIVE rows)", async () => {
    const lic = await rawLicense();
    const [i1, i2] = [await rawInstallation(), await rawInstallation()];
    const a = await prisma.spellActivation.create({ data: activationData(lic.id, i1.id) });
    await prisma.spellActivation.update({ where: { id: a.id }, data: { status: "DEACTIVATED", endReason: "TRANSFERRED", deactivatedAt: T0 } });
    await expect(prisma.spellActivation.create({ data: activationData(lic.id, i2.id) })).resolves.toBeTruthy();
  });

  it("CHECK constraints reject inconsistent activation and license states", async () => {
    const lic = await rawLicense();
    const inst = await rawInstallation();
    // ACTIVE with end data
    await expect(prisma.spellActivation.create({ data: { ...activationData(lic.id, inst.id), deactivatedAt: T0 } })).rejects.toThrow();
    // ended without a reason / time
    await expect(prisma.spellActivation.create({ data: { ...activationData(lic.id, inst.id), status: "DEACTIVATED" } })).rejects.toThrow();
    // DEACTIVATED with a revoke-only reason
    await expect(prisma.spellActivation.create({ data: { ...activationData(lic.id, inst.id), status: "DEACTIVATED", endReason: "LICENSE_REVOKED", deactivatedAt: T0 } })).rejects.toThrow();
    // half-started term
    await expect(prisma.spellLicense.update({ where: { id: lic.id }, data: { startsAt: T0 } })).rejects.toThrow();
    // expiry before start
    await expect(prisma.spellLicense.update({ where: { id: lic.id }, data: { startsAt: T0, expiresAt: new Date(T0.getTime() - 1) } })).rejects.toThrow();
    // REVOKED without revokedAt
    await expect(prisma.spellLicense.update({ where: { id: lic.id }, data: { status: "REVOKED" } })).rejects.toThrow();
  });

  it("the audit log is append-only at the database level", async () => {
    const { license } = await issue();
    const events = await prisma.spellLicenseEvent.findMany({ where: { licenseId: license.id } });
    expect(events.length).toBeGreaterThan(0);
    const id = events[0]!.id;
    await expect(prisma.spellLicenseEvent.update({ where: { id }, data: { actorType: "SYSTEM" } })).rejects.toThrow(/append-only/);
    await expect(prisma.spellLicenseEvent.delete({ where: { id } })).rejects.toThrow(/append-only/);
    await expect(prisma.spellLicenseEvent.deleteMany({ where: { licenseId: license.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe("TRUNCATE spell_license_events")).rejects.toThrow(/append-only/);
    expect(await prisma.spellLicenseEvent.count({ where: { id } })).toBe(1);
  });

  it("licenses and their history cannot be deleted out from under an owner (FK RESTRICT)", async () => {
    const owner = await makeUser();
    const { license, code } = await issue(owner.userId);
    await activate(newDevice(), code, T0);
    await expect(prisma.spellLicense.delete({ where: { id: license.id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: owner.userId } })).rejects.toThrow();
  });
});

describe("serialization failures are real, detected and retried", () => {
  it("a genuine write-skew produces an error that isRetryableSerializationFailure recognises", async () => {
    const [x, y] = [await issue(), await issue()];
    let gate!: () => void;
    const bothRead = new Promise<void>((r) => (gate = r));
    let reads = 0;
    const tx = (readId: string, writeId: string) =>
      prisma.$transaction(
        async (t) => {
          await t.spellLicense.findUniqueOrThrow({ where: { id: readId } });
          if (++reads === 2) gate();
          await bothRead;
          await t.spellLicense.update({ where: { id: writeId }, data: { codeHint: "ZZZZ" } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    const results = await Promise.allSettled([tx(x.license.id, y.license.id), tx(y.license.id, x.license.id)]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failures).toHaveLength(1);
    expect(isRetryableSerializationFailure(failures[0]!.reason)).toBe(true);
  });
});

describe("concurrent activation & transfer never produce two ACTIVE activations", () => {
  it("first activation: N computers race for one fresh license", async () => {
    for (let round = 0; round < 3; round++) {
      const { code, license } = await issue();
      const devices = Array.from({ length: RACERS }, () => newDevice());
      const results = await Promise.allSettled(devices.map((d) => activate(d, code, T0)));

      expect(fulfilled(results)).toHaveLength(1);
      expect(fulfilled(results)[0]!.value.status).toBe("ACTIVATED");
      const codes = rejectedCodes(results);
      expect(codes).toHaveLength(RACERS - 1);
      for (const c of codes) expect(["TRANSFER_CONFIRMATION_REQUIRED", "ACTIVATION_CONFLICT"]).toContain(c);

      expect(await activeCount(license.id)).toBe(1);
      expect(await prisma.spellActivation.count({ where: { licenseId: license.id } })).toBe(1);
      expect(await eventCount(license.id, "LICENSE_FIRST_ACTIVATED")).toBe(1);
      const row = await prisma.spellLicense.findUniqueOrThrow({ where: { id: license.id } });
      expect(row.startsAt).toEqual(T0);
      expect(row.expiresAt).toEqual(new Date("2027-01-05T09:00:00.000Z"));
    }
  });

  it("transfer: N computers race to take a license held by A (all confirmed against A)", async () => {
    for (let round = 0; round < 4; round++) {
      const { code, license } = await issue();
      const A = newDevice();
      const gA = await activate(A, code, T0);
      const t1 = new Date(T0.getTime() + DAY);
      const devices = Array.from({ length: RACERS }, () => newDevice());
      const results = await Promise.allSettled(devices.map((d) => activate(d, code, t1, gA.activationId)));

      expect(fulfilled(results)).toHaveLength(1);
      expect(fulfilled(results)[0]!.value.status).toBe("TRANSFERRED");
      for (const c of rejectedCodes(results)) {
        expect(["TRANSFER_COOLDOWN_ACTIVE", "TRANSFER_CONFIRMATION_REQUIRED", "ACTIVATION_CONFLICT"]).toContain(c);
      }

      expect(await activeCount(license.id)).toBe(1);
      expect(await prisma.spellActivation.count({ where: { licenseId: license.id } })).toBe(2);
      const old = await prisma.spellActivation.findUniqueOrThrow({ where: { id: gA.activationId } });
      expect(old).toMatchObject({ status: "DEACTIVATED", endReason: "TRANSFERRED" });
      expect(await eventCount(license.id, "ACTIVATION_TRANSFERRED")).toBe(1);

      // The old computer is now locked out; exactly one new activation validates.
      await expect(validate(A, gA.activationId, t1)).rejects.toMatchObject({ code: "ACTIVATION_NOT_ACTIVE" });
      const winner = fulfilled(results)[0]!.value;
      const winnerDevice = devices[results.findIndex((r) => r.status === "fulfilled")]!;
      await expect(validate(winnerDevice, winner.activationId, t1)).resolves.toMatchObject({ status: "VALID" });
    }
  });

  it("with retries exhausted, losers get a typed ACTIVATION_CONFLICT (never a raw driver error) and state stays consistent", async () => {
    const strict: SpellAdminDeps = {
      ...deps,
      unitOfWork: new PrismaSpellUnitOfWork({ maxAttempts: 1, baseDelayMs: 1, sleep: async () => undefined }),
    };
    for (let round = 0; round < 3; round++) {
      const { code, license } = await issue();
      const devices = Array.from({ length: RACERS }, () => newDevice());
      const results = await Promise.allSettled(
        devices.map((d) =>
          activateLicense(
            { code, platform: SpellPlatform.WINDOWS, appVersion: "1", device: principal(d), ipHash: null },
            strict,
            T0,
          ),
        ),
      );
      const codes = rejectedCodes(results);
      for (const c of codes) expect(["ACTIVATION_CONFLICT", "TRANSFER_CONFIRMATION_REQUIRED"]).toContain(c);
      expect(fulfilled(results).length).toBeLessThanOrEqual(1);
      expect(await activeCount(license.id)).toBe(fulfilled(results).length);
    }
  });

  it("the same computer retrying concurrently creates exactly one activation", async () => {
    const { code, license } = await issue();
    const d = newDevice();
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => activate(d, code, T0)));
    expect(rejectedCodes(results).filter((c) => c !== "ACTIVATION_CONFLICT")).toEqual([]);
    const ok = fulfilled(results);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => r.value.activationId)).size).toBe(1);
    expect(ok.filter((r) => r.value.status === "ACTIVATED")).toHaveLength(1);
    expect(await prisma.spellActivation.count({ where: { licenseId: license.id } })).toBe(1);
    expect(await activeCount(license.id)).toBe(1);
  });

  it("property: random interleavings of activate / transfer / validate / revoke / force-deactivate keep every invariant", async () => {
    for (let round = 0; round < 8; round++) {
      const { code, license } = await issue();
      const seed = newDevice();
      const gSeed = await activate(seed, code, T0);
      const t = new Date(T0.getTime() + 2 * DAY);
      const devices = Array.from({ length: 6 }, () => newDevice());
      const ops: Promise<unknown>[] = [
        ...devices.map((d, i) => activate(d, code, t, i % 2 ? gSeed.activationId : undefined)),
        validate(seed, gSeed.activationId, t),
        adminDeactivateSpellActivation(admin, license.id, "race", deps, t),
      ];
      const doRevoke = round % 2 === 0;
      const revokeIndex = doRevoke ? ops.length : -1;
      if (doRevoke) ops.push(revokeSpellLicense(admin, license.id, "race", deps, t));
      const settled = await Promise.allSettled(ops);

      for (const r of settled) {
        if (r.status === "rejected") {
          // Typed domain errors only — never a raw driver/DB error.
          expect((r.reason as { code?: string }).code, String(r.reason)).toBeTruthy();
        }
      }
      const active = await activeCount(license.id);
      expect(active).toBeLessThanOrEqual(1);
      const lic = await prisma.spellLicense.findUniqueOrThrow({ where: { id: license.id } });
      if (lic.status === "REVOKED") expect(active).toBe(0);
      if (doRevoke) {
        // The revoke either took effect exactly once, or told the admin it lost
        // the race (typed, retryable) and left no trace. Never half-applied.
        const outcome = settled[revokeIndex]!;
        if (outcome.status === "fulfilled") {
          expect(lic.status).toBe("REVOKED");
          expect(await eventCount(license.id, "LICENSE_REVOKED")).toBe(1);
        } else {
          expect((outcome.reason as { code?: string }).code).toBe("ACTIVATION_CONFLICT");
          expect(lic.status).toBe("ACTIVE");
          expect(await eventCount(license.id, "LICENSE_REVOKED")).toBe(0);
        }
      }
    }
    // Informational: proves the retry path was actually exercised under contention.
    console.info(`[spell-db] serialization retries observed: ${retries}`);
  });
});

describe("end to end against Postgres", () => {
  it("issue → owner reveal → activate → transfer → validate, with a persisted, consistent audit trail", async () => {
    const owner = await makeUser();
    const { code, license } = await issue(owner.userId, SpellPlanCode.SPELL_12M);

    // Bytes round trip through BYTEA, authenticated by AAD.
    const row = await prisma.spellLicense.findUniqueOrThrow({ where: { id: license.id } });
    expect(row.codeEncKeyVersion).toBe("e1");
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(row.codeCiphertext).toString("latin1")).not.toContain(code.replaceAll("-", "").slice(4));
    expect((await revealLicenseCode(owner, license.id, null, deps, T0)).code).toBe(code);

    const A = newDevice();
    const B = newDevice();
    const gA = await activate(A, code, T0);
    await expect(activate(B, code, new Date(T0.getTime() + DAY))).rejects.toMatchObject({ code: "TRANSFER_CONFIRMATION_REQUIRED" });
    expect(await activeCount(license.id)).toBe(1);

    const gB = await activate(B, code, new Date(T0.getTime() + DAY), gA.activationId);
    expect(gB.status).toBe("TRANSFERRED");
    expect(gB.license.expiresAt).toBe("2027-10-05T09:00:00.000Z");
    await expect(validate(A, gA.activationId, new Date(T0.getTime() + DAY))).rejects.toMatchObject({ code: "ACTIVATION_NOT_ACTIVE" });
    await expect(validate(B, gB.activationId, new Date(T0.getTime() + DAY))).resolves.toMatchObject({ status: "VALID" });

    const detail = await getSpellLicenseDetail(admin, license.id, deps, new Date(T0.getTime() + DAY));
    expect(detail.events.map((e) => e.type).reverse()).toEqual([
      "LICENSE_ISSUED", "LICENSE_CODE_REVEALED", "LICENSE_FIRST_ACTIVATED", "ACTIVATION_CREATED", "ACTIVATION_TRANSFERRED",
    ]);
    expect(detail.activations.map((a) => a.status).sort()).toEqual(["ACTIVE", "DEACTIVATED"]);
    expect(detail.license.status).toBe("ACTIVE");
    const stored = JSON.stringify(await prisma.spellLicenseEvent.findMany({ where: { licenseId: license.id } }));
    expect(stored).not.toContain(code);
  });

  it("the encryption key version is persisted beside the ciphertext and supports rotation", async () => {
    const owner = await makeUser();
    const { code, license } = await issue(owner.userId);
    const stored = await prisma.spellLicense.findUniqueOrThrow({ where: { id: license.id } });
    expect(stored.codeEncKeyVersion).toBe("e1");

    // Rotate: new ring has e2 active and e1 retained; re-encrypt and persist.
    const e2Ring = new Map(config.codeEncryptionKeys.keys).set("e2", Buffer.from(randomBytes(32)));
    const rotated = new KeyRingSpellCodeVault(config.codeHmacKeys, { activeId: "e2", keys: e2Ring });
    const moved = rotated.reencrypt({ ciphertext: new Uint8Array(stored.codeCiphertext), keyVersion: stored.codeEncKeyVersion, licenseId: license.id });
    await deps.repos.licenseRepository.updateCodeCiphertext(license.id, moved.ciphertext, moved.keyVersion);

    const after = await prisma.spellLicense.findUniqueOrThrow({ where: { id: license.id } });
    expect(after.codeEncKeyVersion).toBe("e2");
    const rotatedDeps: SpellAdminDeps = { ...deps, vault: rotated };
    expect((await revealLicenseCode(owner, license.id, null, rotatedDeps, T0)).code).toBe(code);
  });

  it("a failure mid-transfer rolls everything back in Postgres", async () => {
    const { code, license } = await issue();
    const A = newDevice();
    const B = newDevice();
    const gA = await activate(A, code, T0);
    const real = deps.tokenIssuer;
    deps.tokenIssuer = { issue: async () => { throw new Error("signing down"); } };
    try {
      await expect(activate(B, code, new Date(T0.getTime() + DAY), gA.activationId)).rejects.toThrow("signing down");
    } finally {
      deps.tokenIssuer = real;
    }
    expect(await activeCount(license.id)).toBe(1);
    expect((await prisma.spellActivation.findUniqueOrThrow({ where: { id: gA.activationId } })).status).toBe("ACTIVE");
    expect(await prisma.spellInstallation.count({ where: { keyThumbprint: B.thumbprint } })).toBe(0);
    expect(await eventCount(license.id, "ACTIVATION_TRANSFERRED")).toBe(0);
    expect((await prisma.spellLicense.findUniqueOrThrow({ where: { id: license.id } })).lastDeviceChangeAt).toBeNull();
  });

  it("revocation ends the activation and persists across a fresh read", async () => {
    const { code, license } = await issue();
    const A = newDevice();
    const g = await activate(A, code, T0);
    await revokeSpellLicense(admin, license.id, "chargeback", deps, new Date(T0.getTime() + DAY));
    await expect(validate(A, g.activationId, new Date(T0.getTime() + DAY))).rejects.toMatchObject({ code: "ACTIVATION_NOT_ACTIVE", details: { endReason: "LICENSE_REVOKED" } });
    await expect(activate(newDevice(), code, new Date(T0.getTime() + DAY))).rejects.toMatchObject({ code: "LICENSE_REVOKED" });
    expect(await prisma.auditLog.count({ where: { entityType: "SpellLicense", entityId: license.id } })).toBe(2);
  });
});

describe("replay protection and brute-force counters in Postgres", () => {
  it("a nonce can be consumed exactly once, even under concurrency", async () => {
    const thumb = randomUUID();
    const nonce = randomUUID();
    const exp = new Date(Date.now() + 600_000);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => deps.nonceRepository.tryConsume({ installationThumbprint: thumb, nonce, expiresAt: exp })),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await deps.nonceRepository.deleteExpired(new Date(exp.getTime() + 1))).toBeGreaterThanOrEqual(1);
  });

  it("counts failed code attempts per IP and per installation inside the window", async () => {
    const ip = randomUUID();
    const thumb = randomUUID();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      await deps.attemptRepository.record({ kind: "ACTIVATE" as never, outcome: "INVALID_CODE" as never, ipHash: ip, installationThumbprint: thumb, at: now });
    }
    await deps.attemptRepository.record({ kind: "ACTIVATE" as never, outcome: "INVALID_CODE" as never, ipHash: ip, at: new Date(now.getTime() - 3600_000) });
    await deps.attemptRepository.record({ kind: "VALIDATE" as never, outcome: "INVALID_CODE" as never, ipHash: ip, at: now });
    const counts = await deps.attemptRepository.countFailedCodeAttempts({ ipHash: ip, installationThumbprint: thumb, since: new Date(now.getTime() - 900_000) });
    expect(counts).toEqual({ byIp: 3, byInstallation: 3 });
  });
});
