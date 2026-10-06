import {
  SpellActivationEndReason,
  SpellActivationStatus,
  SpellActorType,
  SpellAttemptKind,
  SpellEventType,
} from "@/domain/spell/enums";
import { spellErrors } from "@/domain/spell/errors";
import type { SpellDeps } from "./deps";
import type { AuthenticatedInstallation } from "./authenticate-installation-request";
import { recordAttemptForError, recordAttemptSuccess } from "./record-attempt";

/**
 * A computer voluntarily releasing its license (e.g. before uninstalling).
 * Idempotent. Does not touch the device-change cooldown: releasing a license
 * is not moving it, and activating a *different* computer afterwards is still
 * a device change subject to the cooldown.
 */
export async function deactivateOwnActivation(
  input: {
    activationId: string;
    device: AuthenticatedInstallation;
    ipHash: string | null;
  },
  deps: SpellDeps,
  now: Date = new Date(),
): Promise<{ deactivated: boolean }> {
  const attemptBase = {
    kind: SpellAttemptKind.DEACTIVATE,
    ipHash: input.ipHash,
    installationThumbprint: input.device.thumbprint,
    at: now,
  };
  try {
    const result = await deps.unitOfWork.runInTransaction(async (repos) => {
      const installation = input.device.installation;
      if (!installation) throw spellErrors.installationUnknown();
      const activation = await repos.activationRepository.findById(input.activationId);
      if (!activation || activation.installationId !== installation.id) {
        throw spellErrors.activationNotActive();
      }
      if (activation.status !== SpellActivationStatus.ACTIVE) {
        return { deactivated: false, licenseId: activation.licenseId };
      }
      const ended = await repos.activationRepository.end({
        id: activation.id,
        status: SpellActivationStatus.DEACTIVATED,
        reason: SpellActivationEndReason.USER_DEACTIVATED,
        at: now,
      });
      if (ended) {
        await repos.eventRepository.append({
          licenseId: activation.licenseId,
          activationId: activation.id,
          type: SpellEventType.ACTIVATION_DEACTIVATED,
          actorType: SpellActorType.DEVICE,
          ipHash: input.ipHash,
          metadata: { installationId: installation.id, reason: "USER_DEACTIVATED" },
          createdAt: now,
        });
      }
      return { deactivated: ended, licenseId: activation.licenseId };
    });
    await recordAttemptSuccess(deps.attemptRepository, {
      ...attemptBase,
      licenseId: result.licenseId,
    });
    return { deactivated: result.deactivated };
  } catch (error) {
    await recordAttemptForError(deps.attemptRepository, attemptBase, error);
    throw error;
  }
}
