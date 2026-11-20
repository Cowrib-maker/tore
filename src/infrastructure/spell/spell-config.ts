import { createPrivateKey } from "node:crypto";

import {
  DEFAULT_SPELL_POLICY,
  validateSpellPolicy,
  type SpellPolicy,
} from "@/domain/spell/policy";

/**
 * Spell configuration is read at call time (like QPay's `readQpayConfig`),
 * not at boot, so an unconfigured Spell can never break unrelated pages or
 * `next build`. Error messages name variables, never values.
 *
 * Key rings are `id:base64` pairs, comma separated. The ACTIVE id is used for
 * new data; the others remain usable for verification/decryption during
 * rotation.
 */

export class SpellConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid TORE Spell configuration: ${problems.join("; ")}`);
    this.name = "SpellConfigError";
  }
}

export type SymmetricKeyRing = {
  activeId: string;
  keys: ReadonlyMap<string, Buffer>;
};

export type SigningKeyRing = {
  activeKid: string;
  /** kid -> base64 PKCS#8 DER of an Ed25519 private key */
  keys: ReadonlyMap<string, Buffer>;
};

export type SpellConfig = {
  policy: SpellPolicy;
  codeHmacKeys: SymmetricKeyRing;
  codeEncryptionKeys: SymmetricKeyRing;
  signing: SigningKeyRing;
};

type EnvSource = Record<string, string | undefined>;

const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;

function parseRing(
  name: string,
  raw: string | undefined,
  validateKey: (bytes: Buffer) => string | null,
  problems: string[],
): Map<string, Buffer> {
  const ring = new Map<string, Buffer>();
  if (!raw || !raw.trim()) {
    problems.push(`${name} is required`);
    return ring;
  }
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    const sep = trimmed.indexOf(":");
    if (sep < 1) {
      problems.push(`${name} entries must look like id:base64`);
      continue;
    }
    const id = trimmed.slice(0, sep);
    const b64 = trimmed.slice(sep + 1);
    if (!KEY_ID.test(id)) {
      problems.push(`${name} has an invalid key id`);
      continue;
    }
    if (ring.has(id)) {
      problems.push(`${name} has a duplicate key id`);
      continue;
    }
    const bytes = Buffer.from(b64, "base64");
    const keyProblem = bytes.length === 0 ? "is empty" : validateKey(bytes);
    if (keyProblem) {
      problems.push(`${name} key "${id}" ${keyProblem}`);
      continue;
    }
    ring.set(id, bytes);
  }
  return ring;
}

function parseIntVar(
  source: EnvSource,
  name: string,
  fallback: number,
  problems: string[],
  scale = 1,
): number {
  const raw = source[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    problems.push(`${name} must be a non-negative integer`);
    return fallback;
  }
  return Number(raw) * scale;
}

export function parseSpellConfig(source: EnvSource): SpellConfig {
  const problems: string[] = [];
  const key32 = (b: Buffer) => (b.length === 32 ? null : "must be 32 bytes");

  const hmac = parseRing("SPELL_CODE_HMAC_KEYS", source.SPELL_CODE_HMAC_KEYS, key32, problems);
  const enc = parseRing("SPELL_CODE_ENC_KEYS", source.SPELL_CODE_ENC_KEYS, key32, problems);
  const signing = parseRing(
    "SPELL_SIGNING_KEYS",
    source.SPELL_SIGNING_KEYS,
    (b) => {
      try {
        const key = createPrivateKey({ key: b, format: "der", type: "pkcs8" });
        return key.asymmetricKeyType === "ed25519" ? null : "must be Ed25519";
      } catch {
        return "is not a valid PKCS#8 DER private key";
      }
    },
    problems,
  );

  const activeOf = (name: string, ring: Map<string, Buffer>) => {
    const id = source[name]?.trim() ?? "";
    if (!id) {
      problems.push(`${name} is required`);
    } else if (ring.size > 0 && !ring.has(id)) {
      problems.push(`${name} does not match a configured key id`);
    }
    return id;
  };
  const hmacActive = activeOf("SPELL_CODE_HMAC_ACTIVE_KEY_ID", hmac);
  const encActive = activeOf("SPELL_CODE_ENC_ACTIVE_KEY_ID", enc);
  const signingActive = activeOf("SPELL_SIGNING_ACTIVE_KID", signing);

  const D = DEFAULT_SPELL_POLICY;
  const policy: SpellPolicy = {
    redeemByDays: parseIntVar(source, "SPELL_REDEEM_BY_DAYS", D.redeemByDays, problems),
    transferCooldownDays: parseIntVar(
      source,
      "SPELL_TRANSFER_COOLDOWN_DAYS",
      D.transferCooldownDays,
      problems,
    ),
    tokenRefreshIntervalSeconds: parseIntVar(
      source,
      "SPELL_TOKEN_REFRESH_INTERVAL_HOURS",
      D.tokenRefreshIntervalSeconds,
      problems,
      3600,
    ),
    tokenMaxOfflineSeconds: parseIntVar(
      source,
      "SPELL_TOKEN_MAX_OFFLINE_HOURS",
      D.tokenMaxOfflineSeconds,
      problems,
      3600,
    ),
    requestSkewSeconds: parseIntVar(
      source,
      "SPELL_REQUEST_SKEW_SECONDS",
      D.requestSkewSeconds,
      problems,
    ),
    maxFailedCodeAttempts: parseIntVar(
      source,
      "SPELL_MAX_FAILED_CODE_ATTEMPTS",
      D.maxFailedCodeAttempts,
      problems,
    ),
    failedCodeAttemptWindowSeconds: parseIntVar(
      source,
      "SPELL_FAILED_ATTEMPT_WINDOW_MINUTES",
      D.failedCodeAttemptWindowSeconds,
      problems,
      60,
    ),
  };
  problems.push(...validateSpellPolicy(policy));

  if (problems.length > 0) {
    throw new SpellConfigError(problems);
  }
  return {
    policy,
    codeHmacKeys: { activeId: hmacActive, keys: hmac },
    codeEncryptionKeys: { activeId: encActive, keys: enc },
    signing: { activeKid: signingActive, keys: signing },
  };
}
