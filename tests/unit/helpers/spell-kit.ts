import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign as nodeSign,
  type KeyObject,
} from "node:crypto";

import { UserRole } from "@/domain/enums";
import type { ActorContext } from "@/application/common/actor-context";
import type { SpellAdminDeps } from "@/application/use-cases/spell/deps";
import { issueSpellLicense } from "@/application/use-cases/spell/admin-licenses";
import {
  activateLicense,
  type ActivateLicenseInput,
} from "@/application/use-cases/spell/activate-license";
import {
  authenticateSignedRequest,
  toAuthenticateDeps,
  type SignedRequest,
} from "@/application/use-cases/spell/authenticate-installation-request";
import { validateActivation } from "@/application/use-cases/spell/validate-activation";
import { deactivateOwnActivation } from "@/application/use-cases/spell/deactivate-activation";
import {
  buildCanonicalRequest,
  computeKeyThumbprint,
  encodeBase64Url,
} from "@/domain/spell/device-identity";
import { SpellAttemptKind, SpellPlanCode, SpellPlatform } from "@/domain/spell/enums";
import { DEFAULT_SPELL_POLICY, type SpellPolicy } from "@/domain/spell/policy";
import type { SpellGrant } from "@/application/use-cases/spell/grant";
import { createInMemorySpell } from "@/infrastructure/repositories/in-memory-spell-repositories";
import { KeyRingSpellCodeVault } from "@/infrastructure/spell/code-vault";
import { JoseSpellTokenIssuer } from "@/infrastructure/spell/entitlement-token";
import { parseSpellConfig } from "@/infrastructure/spell/spell-config";

export const DAY = 86_400_000;

export function randomKeyB64(): string {
  return randomBytes(32).toString("base64");
}

export function signingKeyB64(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return (privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).toString("base64");
}

/** A complete, valid Spell environment with fresh random keys. */
export function makeSpellEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  return {
    SPELL_CODE_HMAC_KEYS: `h1:${randomKeyB64()}`,
    SPELL_CODE_HMAC_ACTIVE_KEY_ID: "h1",
    SPELL_CODE_ENC_KEYS: `e1:${randomKeyB64()}`,
    SPELL_CODE_ENC_ACTIVE_KEY_ID: "e1",
    SPELL_SIGNING_KEYS: `k1:${signingKeyB64()}`,
    SPELL_SIGNING_ACTIVE_KID: "k1",
    ...(overrides as Record<string, string>),
  };
}

export type TestDevice = {
  publicKey: string;
  thumbprint: string;
  privateKey: KeyObject;
};

export function newDevice(): TestDevice {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const x = (publicKey.export({ format: "jwk" }) as { x: string }).x;
  return { publicKey: x, thumbprint: computeKeyThumbprint(Buffer.from(x, "base64url")), privateKey };
}

export function signRequest(
  device: TestDevice,
  input: {
    method?: string;
    path: string;
    body: unknown;
    now: Date;
    timestamp?: string;
    nonce?: string;
    ipHash?: string | null;
  },
): SignedRequest {
  const rawBody = JSON.stringify(input.body);
  const timestamp = input.timestamp ?? String(Math.floor(input.now.getTime() / 1000));
  const nonce = input.nonce ?? encodeBase64Url(randomBytes(18));
  const method = input.method ?? "POST";
  const signature = encodeBase64Url(
    nodeSign(
      null,
      Buffer.from(
        buildCanonicalRequest({ method, path: input.path, timestamp, nonce, rawBody }),
        "utf8",
      ),
      device.privateKey,
    ),
  );
  return {
    method,
    path: input.path,
    rawBody,
    headers: { installation: device.thumbprint, timestamp, nonce, signature },
    ipHash: input.ipHash ?? null,
  };
}

export function makeSpell(policy: Partial<SpellPolicy> = {}) {
  const mem = createInMemorySpell();
  const config = parseSpellConfig(makeSpellEnv());
  const vault = new KeyRingSpellCodeVault(config.codeHmacKeys, config.codeEncryptionKeys);
  const tokenIssuer = new JoseSpellTokenIssuer(config.signing);
  const auditCalls: Record<string, unknown>[] = [];
  const users = new Map<string, { id: string; status: string; deletedAt: Date | null }>();

  const deps: SpellAdminDeps = {
    unitOfWork: mem.unitOfWork,
    repos: {
      licenseRepository: mem.licenseRepository,
      installationRepository: mem.installationRepository,
      activationRepository: mem.activationRepository,
      eventRepository: mem.eventRepository,
    },
    attemptRepository: mem.attemptRepository,
    nonceRepository: mem.nonceRepository,
    vault,
    tokenIssuer,
    policy: { ...DEFAULT_SPELL_POLICY, ...policy },
    userRepository: {
      findById: async (id: string) =>
        (users.get(id) as never) ?? null,
    },
    auditLogRepository: {
      create: async (input) => {
        auditCalls.push(input as unknown as Record<string, unknown>);
        return {} as never;
      },
    },
    randomBytes: (n) => randomBytes(n),
  };

  const admin: ActorContext = { userId: "admin-1", role: UserRole.ADMIN };
  const addUser = (id: string) => {
    users.set(id, { id, status: "ACTIVE", deletedAt: null });
    return { userId: id, role: UserRole.CLIENT } as ActorContext;
  };

  const t0 = new Date("2026-10-05T09:00:00.000Z");

  async function issue(
    options: { plan?: SpellPlanCode; ownerUserId?: string; now?: Date } = {},
  ) {
    return issueSpellLicense(
      admin,
      { planCode: options.plan ?? SpellPlanCode.SPELL_3M, ownerUserId: options.ownerUserId },
      deps,
      options.now ?? t0,
    );
  }

  async function activate(
    device: TestDevice,
    code: string,
    options: {
      now: Date;
      confirm?: string | null;
      machineHint?: string;
      ipHash?: string | null;
      platform?: SpellPlatform;
    },
  ): Promise<SpellGrant> {
    const body = {
      code,
      installation: {
        publicKey: device.publicKey,
        platform: options.platform ?? SpellPlatform.WINDOWS,
        appVersion: "1.0.0",
        ...(options.machineHint ? { machineHint: options.machineHint } : {}),
      },
      ...(options.confirm ? { confirmTransferOfActivationId: options.confirm } : {}),
    };
    const authed = await authenticateSignedRequest(
      signRequest(device, {
        path: "/api/spell/v1/activations",
        body,
        now: options.now,
        ipHash: options.ipHash ?? null,
      }),
      toAuthenticateDeps(deps),
      SpellAttemptKind.ACTIVATE,
      { registerPublicKey: device.publicKey },
      options.now,
    );
    const input: ActivateLicenseInput = {
      code,
      platform: options.platform ?? SpellPlatform.WINDOWS,
      appVersion: "1.0.0",
      machineHint: options.machineHint ?? null,
      confirmTransferOfActivationId: options.confirm ?? null,
      device: authed,
      ipHash: options.ipHash ?? null,
    };
    return activateLicense(input, deps, options.now);
  }

  async function validate(device: TestDevice, activationId: string, now: Date) {
    const authed = await authenticateSignedRequest(
      signRequest(device, { path: "/api/spell/v1/validations", body: { activationId }, now }),
      toAuthenticateDeps(deps),
      SpellAttemptKind.VALIDATE,
      {},
      now,
    );
    return validateActivation({ activationId, device: authed, ipHash: null }, deps, now);
  }

  async function deactivate(device: TestDevice, activationId: string, now: Date) {
    const authed = await authenticateSignedRequest(
      signRequest(device, { path: "/api/spell/v1/deactivations", body: { activationId }, now }),
      toAuthenticateDeps(deps),
      SpellAttemptKind.DEACTIVATE,
      {},
      now,
    );
    return deactivateOwnActivation({ activationId, device: authed, ipHash: null }, deps, now);
  }

  const activeCount = (licenseId: string) =>
    [...mem.state.activations.values()].filter(
      (a) => a.licenseId === licenseId && a.status === "ACTIVE",
    ).length;

  return {
    mem,
    deps,
    vault,
    tokenIssuer,
    config,
    admin,
    addUser,
    auditCalls,
    t0,
    issue,
    activate,
    validate,
    deactivate,
    activeCount,
  };
}

export async function rejection(promise: Promise<unknown>): Promise<{ code?: string; details?: unknown; error: unknown }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; details?: unknown };
    return { code: e.code, details: e.details, error };
  }
  throw new Error("expected promise to reject");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
