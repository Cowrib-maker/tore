import {
  SpellActivationStatus,
  SpellAttemptKind,
  SpellEffectiveLicenseStatus,
} from "@/domain/spell/enums";
import { spellErrors } from "@/domain/spell/errors";
import { deriveLicenseState } from "@/domain/spell/license-state";
import type { SpellDeps } from "./deps";
import { buildGrant, type SpellGrant } from "./grant";
import type { AuthenticatedInstallation } from "./authenticate-installation-request";
import { recordAttemptForError, recordAttemptSuccess } from "./record-attempt";

/**
 * Server validation (app start-up and every refresh interval). Succeeds only
 * while THIS installation still holds the ACTIVE activation of a license that
 * is neither revoked nor expired; then issues a fresh signed token. After a
 * transfer the old installation lands in ACTIVATION_NOT_ACTIVE here — its
 * very next validation — which is the authoritative revocation point.
 */
export async function validateActivation(
  input: {
    activationId: string;
    device: AuthenticatedInstallation;
    ipHash: string | null;
  },
  deps: SpellDeps,
  now: Date = new Date(),
): Promise<SpellGrant> {
  const attemptBase = {
    kind: SpellAttemptKind.VALIDATE,
    ipHash: input.ipHash,
    installationThumbprint: input.device.thumbprint,
    at: now,
  };
  let licenseId: string | null = null;
  try {
    const grant = await deps.unitOfWork.runInTransaction(async (repos) => {
      const installation = input.device.installation;
      if (!installation) throw spellErrors.installationUnknown();

      const activation = await repos.activationRepository.findById(input.activationId);
      // Unknown id and "someone else's activation" are indistinguishable.
      if (!activation || activation.installationId !== installation.id) {
        throw spellErrors.activationNotActive();
      }
      licenseId = activation.licenseId;

      if (activation.status !== SpellActivationStatus.ACTIVE) {
        throw spellErrors.activationNotActive({
          status: activation.status,
          endReason: activation.endReason,
          endedAt: activation.deactivatedAt?.toISOString() ?? null,
        });
      }
      const license = await repos.licenseRepository.findById(activation.licenseId);
      if (!license || !license.startsAt || !license.expiresAt) {
        throw spellErrors.activationNotActive();
      }
      const state = deriveLicenseState(license, now);
      if (state.status === SpellEffectiveLicenseStatus.REVOKED) {
        throw spellErrors.licenseRevoked();
      }
      if (state.status === SpellEffectiveLicenseStatus.EXPIRED) {
        throw spellErrors.licenseExpired();
      }

      const issued = await deps.tokenIssuer.issue({
        licenseId: license.id,
        activationId: activation.id,
        installationThumbprint: installation.keyThumbprint,
        planCode: license.planCode,
        licenseExpiresAt: license.expiresAt,
        now,
        maxOfflineSeconds: deps.policy.tokenMaxOfflineSeconds,
        refreshIntervalSeconds: deps.policy.tokenRefreshIntervalSeconds,
      });
      await repos.activationRepository.recordValidation(activation.id, now, issued.jti);
      await repos.installationRepository.touch(installation.id, now);
      return buildGrant({
        status: "VALID",
        activationId: activation.id,
        license,
        startsAt: license.startsAt,
        expiresAt: license.expiresAt,
        issued,
        policy: deps.policy,
        now,
      });
    });
    await recordAttemptSuccess(deps.attemptRepository, { ...attemptBase, licenseId });
    return grant;
  } catch (error) {
    await recordAttemptForError(deps.attemptRepository, { ...attemptBase, licenseId }, error);
    throw error;
  }
}
