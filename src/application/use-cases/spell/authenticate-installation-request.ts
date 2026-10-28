import {
  buildCanonicalRequest,
  computeKeyThumbprint,
  isBase64Url,
  parseRawEd25519PublicKey,
  verifyEd25519Signature,
} from "@/domain/spell/device-identity";
import { SpellAttemptKind } from "@/domain/spell/enums";
import { spellErrors } from "@/domain/spell/errors";
import type { SpellInstallation } from "@/domain/spell/entities";
import type { SpellPolicy } from "@/domain/spell/policy";
import type { SpellInstallationRepository } from "@/domain/repositories/spell-installation-repository";
import type {
  SpellAttemptRepository,
  SpellNonceRepository,
} from "@/domain/repositories/spell-guard-repository";
import type { SpellDeps } from "./deps";
import { recordAttemptForError } from "./record-attempt";

export type SignedRequest = {
  method: string;
  /** Pathname only (no query), exactly as the client signed it. */
  path: string;
  rawBody: string;
  headers: {
    installation: string | null;
    timestamp: string | null;
    nonce: string | null;
    signature: string | null;
  };
  ipHash: string | null;
};

export type AuthenticatedInstallation = {
  thumbprint: string;
  publicKey: string;
  /** Null only when `registerPublicKey` was used for a first-time install. */
  installation: SpellInstallation | null;
};

export type AuthenticateDeps = {
  installationRepository: Pick<SpellInstallationRepository, "findByThumbprint">;
  nonceRepository: SpellNonceRepository;
  attemptRepository: SpellAttemptRepository;
  policy: Pick<SpellPolicy, "requestSkewSeconds">;
};

/**
 * Proof-of-possession authentication for desktop requests. Order matters:
 * shape → clock window → key resolution → signature → nonce. The nonce is
 * consumed only after the signature verifies, so an unauthenticated caller
 * cannot burn a legitimate client's nonces.
 *
 * `registerPublicKey` is supplied for activation, where the installation is
 * not yet known: the key comes from the (signed) body and must hash to the
 * thumbprint in the header. Everywhere else the key comes from our database.
 */
export async function authenticateSignedRequest(
  request: SignedRequest,
  deps: AuthenticateDeps,
  kind: SpellAttemptKind,
  options: { registerPublicKey?: string } = {},
  now: Date = new Date(),
): Promise<AuthenticatedInstallation> {
  const attemptBase = {
    kind,
    ipHash: request.ipHash,
    installationThumbprint: null as string | null,
    at: now,
  };
  try {
    const { installation: thumbprint, timestamp, nonce, signature } = request.headers;

    if (
      !isBase64Url(thumbprint, 64) ||
      !isBase64Url(nonce, 64) ||
      nonce.length < 16 ||
      !isBase64Url(signature, 128) ||
      !timestamp ||
      !/^\d{1,12}$/.test(timestamp)
    ) {
      throw spellErrors.signatureInvalid();
    }
    attemptBase.installationThumbprint = thumbprint;

    const skewMs = deps.policy.requestSkewSeconds * 1000;
    if (Math.abs(now.getTime() - Number(timestamp) * 1000) > skewMs) {
      throw spellErrors.timestampInvalid();
    }

    let publicKey: string;
    let installation: SpellInstallation | null = null;
    if (options.registerPublicKey !== undefined) {
      const raw = parseRawEd25519PublicKey(options.registerPublicKey);
      if (!raw || computeKeyThumbprint(raw) !== thumbprint) {
        throw spellErrors.signatureInvalid();
      }
      publicKey = options.registerPublicKey;
      installation = await deps.installationRepository.findByThumbprint(thumbprint);
    } else {
      installation = await deps.installationRepository.findByThumbprint(thumbprint);
      if (!installation) throw spellErrors.installationUnknown();
      publicKey = installation.publicKey;
    }

    const valid = verifyEd25519Signature({
      publicKey,
      signature,
      message: buildCanonicalRequest({
        method: request.method,
        path: request.path,
        timestamp,
        nonce,
        rawBody: request.rawBody,
      }),
    });
    if (!valid) throw spellErrors.signatureInvalid();

    // Revocation is checked after the signature so it is not an oracle for
    // unauthenticated callers.
    if (installation?.revokedAt) throw spellErrors.installationRevoked();

    const fresh = await deps.nonceRepository.tryConsume({
      installationThumbprint: thumbprint,
      nonce,
      // Must outlive the acceptance window on both sides of "now".
      expiresAt: new Date(now.getTime() + 2 * skewMs),
    });
    if (!fresh) throw spellErrors.replayed();

    return { thumbprint, publicKey, installation };
  } catch (error) {
    await recordAttemptForError(deps.attemptRepository, attemptBase, error);
    throw error;
  }
}

export function toAuthenticateDeps(deps: SpellDeps): AuthenticateDeps {
  return {
    installationRepository: deps.repos.installationRepository,
    nonceRepository: deps.nonceRepository,
    attemptRepository: deps.attemptRepository,
    policy: deps.policy,
  };
}
