import {
  SpellActivationEndReason,
  SpellActivationStatus,
  SpellActorType,
  SpellAttemptKind,
  SpellEffectiveLicenseStatus,
  SpellEventType,
  SpellPlatform,
} from "@/domain/spell/enums";
import { spellErrors } from "@/domain/spell/errors";
import { normalizeLicenseCode } from "@/domain/spell/license-code";
import { addUtcMonths, deriveLicenseState } from "@/domain/spell/license-state";
import { SPELL_TRANSFER_WARNING_MN } from "@/domain/spell/messages";
import { classifyActivationRequest } from "@/domain/spell/transfer-policy";
import { SpellActiveActivationConflictError } from "@/domain/repositories/spell-activation-repository";
import type { SpellActivation, SpellLicense } from "@/domain/spell/entities";
import type { SpellDeps } from "./deps";
import { buildGrant, type SpellGrant, type SpellGrantStatus } from "./grant";
import type { AuthenticatedInstallation } from "./authenticate-installation-request";
import { recordAttemptForError, recordAttemptSuccess } from "./record-attempt";

export type ActivateLicenseInput = {
  code: unknown;
  platform: SpellPlatform;
  appVersion: string;
  /** Coarse client hint (never the identity). Hashed before storage. */
  machineHint?: string | null;
  /**
   * Explicit consent to move the license off the computer that currently holds
   * it. Must name the activation being replaced, exactly as returned by the
   * TRANSFER_CONFIRMATION_REQUIRED response, so a stale confirmation cannot
   * evict a different computer than the user saw.
   */
  confirmTransferOfActivationId?: string | null;
  device: AuthenticatedInstallation;
  ipHash: string | null;
};

/**
 * Activate a license on this installation, or transfer it from another one.
 *
 * Everything that decides or changes state happens inside one SERIALIZABLE
 * transaction (retried on serialization failure); the partial unique index on
 * spell_activations is the final backstop, so two ACTIVE activations cannot
 * exist even if this code were wrong. Pre-checks and attempt logging run
 * outside the transaction so rejected requests are still counted.
 */
export async function activateLicense(
  input: ActivateLicenseInput,
  deps: SpellDeps,
  now: Date = new Date(),
): Promise<SpellGrant> {
  const attemptBase = {
    kind: SpellAttemptKind.ACTIVATE,
    ipHash: input.ipHash,
    installationThumbprint: input.device.thumbprint,
    at: now,
  };
  let licenseIdForAttempt: string | null = null;

  try {
    await assertNotLockedOut(input, deps, now);

    const normalized = normalizeLicenseCode(input.code);
    if (!normalized.ok) throw spellErrors.codeInvalid();
    const hashes = deps.vault.lookupHashes(normalized.canonical);
    const machineHintHash = input.machineHint
      ? deps.vault.hashIdentifier("machine-hint", input.machineHint)
      : null;

    const grant = await deps.unitOfWork.runInTransaction(async (repos) => {
      const license = await repos.licenseRepository.findByCodeHashes(hashes);
      if (!license) throw spellErrors.codeInvalid();
      licenseIdForAttempt = license.id;

      assertLicenseUsable(license, now);

      const existingInstallation = await repos.installationRepository.findByThumbprint(
        input.device.thumbprint,
      );
      if (existingInstallation?.revokedAt) throw spellErrors.installationRevoked();

      const installation = await repos.installationRepository.upsert({
        keyThumbprint: input.device.thumbprint,
        publicKey: input.device.publicKey,
        platform: input.platform,
        appVersion: input.appVersion,
        machineHintHash,
        now,
      });

      const active = await repos.activationRepository.findActiveByLicenseId(license.id);
      const latest = await repos.activationRepository.findLatestByLicenseId(license.id);
      const decision = classifyActivationRequest({
        license,
        installationId: installation.id,
        activeActivation: active,
        latestActivation: latest,
        now,
        cooldownDays: deps.policy.transferCooldownDays,
      });

      let status: SpellGrantStatus = "ACTIVATED";
      let activation: SpellActivation;
      let startsAt = license.startsAt;
      let expiresAt = license.expiresAt;

      const issue = async (a: SpellActivation, exp: Date) => {
        const issued = await deps.tokenIssuer.issue({
          licenseId: license.id,
          activationId: a.id,
          installationThumbprint: installation.keyThumbprint,
          planCode: license.planCode,
          licenseExpiresAt: exp,
          now,
          maxOfflineSeconds: deps.policy.tokenMaxOfflineSeconds,
          refreshIntervalSeconds: deps.policy.tokenRefreshIntervalSeconds,
        });
        await repos.activationRepository.recordValidation(a.id, now, issued.jti);
        return issued;
      };

      switch (decision.kind) {
        case "ALREADY_ACTIVE": {
          activation = decision.activation;
          status = "ALREADY_ACTIVE";
          break;
        }

        case "FIRST_ACTIVATION": {
          startsAt = now;
          expiresAt = addUtcMonths(now, license.durationMonths);
          const started = await repos.licenseRepository.startTerm(
            license.id,
            startsAt,
            expiresAt,
          );
          if (!started) throw new SpellActiveActivationConflictError();
          activation = await repos.activationRepository.create({
            licenseId: license.id,
            installationId: installation.id,
            userId: license.ownerUserId,
            activatedAt: now,
            transferredFromActivationId: null,
            lastTokenJti: null,
          });
          await repos.eventRepository.append({
            licenseId: license.id,
            activationId: activation.id,
            type: SpellEventType.LICENSE_FIRST_ACTIVATED,
            actorType: SpellActorType.DEVICE,
            ipHash: input.ipHash,
            metadata: {
              startsAt: startsAt.toISOString(),
              expiresAt: expiresAt.toISOString(),
              durationMonths: license.durationMonths,
            },
            createdAt: now,
          });
          await repos.eventRepository.append({
            licenseId: license.id,
            activationId: activation.id,
            type: SpellEventType.ACTIVATION_CREATED,
            actorType: SpellActorType.DEVICE,
            ipHash: input.ipHash,
            metadata: { installationId: installation.id, platform: input.platform, first: true },
            createdAt: now,
          });
          break;
        }

        case "REACTIVATION": {
          activation = await repos.activationRepository.create({
            licenseId: license.id,
            installationId: installation.id,
            userId: license.ownerUserId,
            activatedAt: now,
            transferredFromActivationId: null,
            lastTokenJti: null,
          });
          await repos.eventRepository.append({
            licenseId: license.id,
            activationId: activation.id,
            type: SpellEventType.ACTIVATION_CREATED,
            actorType: SpellActorType.DEVICE,
            ipHash: input.ipHash,
            metadata: { installationId: installation.id, platform: input.platform, reactivation: true },
            createdAt: now,
          });
          break;
        }

        case "DEVICE_CHANGE": {
          if (decision.cooldown.blocked) {
            throw spellErrors.transferCooldownActive(decision.cooldown.availableAt);
          }
          activation = await repos.activationRepository.create({
            licenseId: license.id,
            installationId: installation.id,
            userId: license.ownerUserId,
            activatedAt: now,
            transferredFromActivationId: null,
            lastTokenJti: null,
          });
          await repos.licenseRepository.setLastDeviceChangeAt(license.id, now);
          await repos.eventRepository.append({
            licenseId: license.id,
            activationId: activation.id,
            type: SpellEventType.ACTIVATION_CREATED,
            actorType: SpellActorType.DEVICE,
            ipHash: input.ipHash,
            metadata: {
              installationId: installation.id,
              platform: input.platform,
              deviceChange: true,
              previousInstallationId: latest?.installationId ?? null,
              sameMachineHint: await sameMachineHint(repos, latest, machineHintHash),
            },
            createdAt: now,
          });
          break;
        }

        case "TRANSFER": {
          const replacing = decision.replacing;
          if (decision.cooldown.blocked) {
            throw spellErrors.transferCooldownActive(decision.cooldown.availableAt);
          }
          if (input.confirmTransferOfActivationId !== replacing.id) {
            const current = await repos.installationRepository.findById(
              replacing.installationId,
            );
            throw spellErrors.transferConfirmationRequired({
              warning: SPELL_TRANSFER_WARNING_MN,
              replacesActivationId: replacing.id,
              currentDevice: {
                platform: current?.platform ?? null,
                activatedAt: replacing.activatedAt.toISOString(),
              },
            });
          }
          const ended = await repos.activationRepository.end({
            id: replacing.id,
            status: SpellActivationStatus.DEACTIVATED,
            reason: SpellActivationEndReason.TRANSFERRED,
            at: now,
          });
          if (!ended) throw new SpellActiveActivationConflictError();
          activation = await repos.activationRepository.create({
            licenseId: license.id,
            installationId: installation.id,
            userId: license.ownerUserId,
            activatedAt: now,
            transferredFromActivationId: replacing.id,
            lastTokenJti: null,
          });
          await repos.activationRepository.setSuperseded(replacing.id, activation.id);
          await repos.licenseRepository.setLastDeviceChangeAt(license.id, now);
          await repos.eventRepository.append({
            licenseId: license.id,
            activationId: activation.id,
            type: SpellEventType.ACTIVATION_TRANSFERRED,
            actorType: SpellActorType.DEVICE,
            ipHash: input.ipHash,
            metadata: {
              fromActivationId: replacing.id,
              fromInstallationId: replacing.installationId,
              toInstallationId: installation.id,
              platform: input.platform,
              sameMachineHint: await sameMachineHint(
                repos,
                replacing,
                machineHintHash,
              ),
            },
            createdAt: now,
          });
          status = "TRANSFERRED";
          break;
        }
      }

      if (!startsAt || !expiresAt) {
        // Unreachable: only FIRST_ACTIVATION runs on an unstarted term.
        throw new Error("Spell invariant: activation without a started term");
      }
      const issued = await issue(activation, expiresAt);
      return buildGrant({
        status,
        activationId: activation.id,
        license,
        startsAt,
        expiresAt,
        issued,
        policy: deps.policy,
        now,
      });
    });

    await recordAttemptSuccess(deps.attemptRepository, {
      ...attemptBase,
      licenseId: grant.license.id,
    });
    return grant;
  } catch (error) {
    await recordAttemptForError(
      deps.attemptRepository,
      { ...attemptBase, licenseId: licenseIdForAttempt },
      error,
    );
    if (error instanceof SpellActiveActivationConflictError) {
      // Retries were exhausted while other requests kept winning the race.
      throw spellErrors.activationConflict();
    }
    throw error;
  }
}

async function assertNotLockedOut(
  input: ActivateLicenseInput,
  deps: SpellDeps,
  now: Date,
): Promise<void> {
  const windowMs = deps.policy.failedCodeAttemptWindowSeconds * 1000;
  const counts = await deps.attemptRepository.countFailedCodeAttempts({
    ipHash: input.ipHash,
    installationThumbprint: input.device.thumbprint,
    since: new Date(now.getTime() - windowMs),
  });
  if (
    counts.byIp >= deps.policy.maxFailedCodeAttempts ||
    counts.byInstallation >= deps.policy.maxFailedCodeAttempts
  ) {
    throw spellErrors.tooManyAttempts(deps.policy.failedCodeAttemptWindowSeconds);
  }
}

function assertLicenseUsable(license: SpellLicense, now: Date): void {
  const state = deriveLicenseState(license, now);
  if (state.status === SpellEffectiveLicenseStatus.REVOKED) {
    throw spellErrors.licenseRevoked();
  }
  if (state.status === SpellEffectiveLicenseStatus.EXPIRED) {
    throw state.expiredBecause === "REDEEM_WINDOW_CLOSED"
      ? spellErrors.redeemWindowClosed()
      : spellErrors.licenseExpired();
  }
}

async function sameMachineHint(
  repos: Parameters<Parameters<SpellDeps["unitOfWork"]["runInTransaction"]>[0]>[0],
  previous: SpellActivation | null,
  newHash: string | null,
): Promise<boolean | null> {
  if (!previous || !newHash) return null;
  const prev = await repos.installationRepository.findById(previous.installationId);
  return prev?.machineHintHash ? prev.machineHintHash === newHash : null;
}
