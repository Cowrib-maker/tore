import type { ActorContext } from "@/application/common/actor-context";
import { NotFoundError } from "@/domain/errors/domain-error";
import {
  SpellActivationEndReason,
  SpellActivationStatus,
  SpellActorType,
  SpellEventType,
} from "@/domain/spell/enums";
import { formatLicenseCode } from "@/domain/spell/license-code";
import type { SpellLicense } from "@/domain/spell/entities";
import type { SpellDeps } from "./deps";
import {
  toActivationDto,
  toLicenseDto,
  transferAvailableAt,
  type SpellActivationDto,
  type SpellLicenseDto,
} from "./dto";

export type OwnerLicenseView = SpellLicenseDto & {
  activeActivation: SpellActivationDto | null;
  /** Null when a device change is allowed right now. */
  transferAvailableAt: string | null;
};

/** Ownership is strict, and a non-owner cannot tell "not yours" from "doesn't exist". */
async function loadOwnedLicense(
  actor: ActorContext,
  licenseId: string,
  deps: Pick<SpellDeps, "repos">,
): Promise<SpellLicense> {
  const license = await deps.repos.licenseRepository.findById(licenseId);
  if (!license || license.ownerUserId !== actor.userId) {
    throw new NotFoundError("License");
  }
  return license;
}

export async function listOwnerLicenses(
  actor: ActorContext,
  deps: SpellDeps,
  now: Date = new Date(),
): Promise<OwnerLicenseView[]> {
  const licenses = await deps.repos.licenseRepository.listByOwner(actor.userId);
  return Promise.all(
    licenses.map(async (license) => {
      const active = await deps.repos.activationRepository.findActiveByLicenseId(license.id);
      const installation = active
        ? await deps.repos.installationRepository.findById(active.installationId)
        : null;
      return {
        ...toLicenseDto(license, now),
        activeActivation: active ? toActivationDto(active, installation) : null,
        transferAvailableAt: transferAvailableAt(
          license,
          now,
          deps.policy.transferCooldownDays,
        ),
      };
    }),
  );
}

/**
 * Owner-only reveal of the full license code. The audit event is written
 * BEFORE the plaintext leaves this function (fail closed: no audit, no code),
 * and it records only that a reveal happened — never the code.
 */
export async function revealLicenseCode(
  actor: ActorContext,
  licenseId: string,
  ipHash: string | null,
  deps: SpellDeps,
  now: Date = new Date(),
): Promise<{ code: string }> {
  const license = await loadOwnedLicense(actor, licenseId, deps);

  await deps.unitOfWork.runInTransaction(async (repos) => {
    await repos.eventRepository.append({
      licenseId: license.id,
      type: SpellEventType.LICENSE_CODE_REVEALED,
      actorType: SpellActorType.USER,
      actorUserId: actor.userId,
      ipHash,
      metadata: { codeEncKeyVersion: license.codeEncKeyVersion },
      createdAt: now,
    });
  });

  const canonical = deps.vault.decrypt({
    ciphertext: license.codeCiphertext,
    keyVersion: license.codeEncKeyVersion,
    licenseId: license.id,
  });
  return { code: formatLicenseCode(canonical) };
}

/** Owner releasing the license from the web (e.g. the old computer is gone). */
export async function deactivateOwnerLicense(
  actor: ActorContext,
  licenseId: string,
  ipHash: string | null,
  deps: SpellDeps,
  now: Date = new Date(),
): Promise<{ deactivated: boolean }> {
  await loadOwnedLicense(actor, licenseId, deps);
  return deps.unitOfWork.runInTransaction(async (repos) => {
    const active = await repos.activationRepository.findActiveByLicenseId(licenseId);
    if (!active) return { deactivated: false };
    const ended = await repos.activationRepository.end({
      id: active.id,
      status: SpellActivationStatus.DEACTIVATED,
      reason: SpellActivationEndReason.USER_DEACTIVATED,
      at: now,
    });
    if (ended) {
      await repos.eventRepository.append({
        licenseId,
        activationId: active.id,
        type: SpellEventType.ACTIVATION_DEACTIVATED,
        actorType: SpellActorType.USER,
        actorUserId: actor.userId,
        ipHash,
        metadata: { reason: "USER_DEACTIVATED", via: "WEB" },
        createdAt: now,
      });
    }
    return { deactivated: ended };
  });
}
