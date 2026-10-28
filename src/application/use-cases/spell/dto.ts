import {
  maskedLicenseCode,
} from "@/domain/spell/license-code";
import { deriveLicenseState } from "@/domain/spell/license-state";
import { evaluateCooldown } from "@/domain/spell/transfer-policy";
import type {
  SpellActivation,
  SpellInstallation,
  SpellLicense,
  SpellLicenseEvent,
} from "@/domain/spell/entities";

/**
 * Wire shapes. These are explicit allow-lists: `codeHash`,
 * `codeCiphertext`, key ids and key versions are never copied out of a
 * license, so they cannot leak through a serializer by accident.
 */
export type SpellLicenseDto = {
  id: string;
  planCode: string;
  durationMonths: number;
  source: string;
  status: string;
  redeemed: boolean;
  redeemBy: string;
  startsAt: string | null;
  expiresAt: string | null;
  ownerUserId: string | null;
  maskedCode: string;
  revokedAt: string | null;
  createdAt: string;
};

export type SpellActivationDto = {
  id: string;
  installationId: string;
  platform: string | null;
  status: string;
  endReason: string | null;
  activatedAt: string;
  lastValidatedAt: string;
  deactivatedAt: string | null;
};

export type SpellEventDto = {
  id: string;
  type: string;
  actorType: string;
  actorUserId: string | null;
  activationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toLicenseDto(license: SpellLicense, now: Date): SpellLicenseDto {
  const state = deriveLicenseState(license, now);
  return {
    id: license.id,
    planCode: license.planCode,
    durationMonths: license.durationMonths,
    source: license.source,
    status: state.status,
    redeemed: state.redeemed,
    redeemBy: license.redeemBy.toISOString(),
    startsAt: iso(license.startsAt),
    expiresAt: iso(license.expiresAt),
    ownerUserId: license.ownerUserId,
    maskedCode: maskedLicenseCode(license.codeHint),
    revokedAt: iso(license.revokedAt),
    createdAt: license.createdAt.toISOString(),
  };
}

export function toActivationDto(
  activation: SpellActivation,
  installation: SpellInstallation | null,
): SpellActivationDto {
  return {
    id: activation.id,
    installationId: activation.installationId,
    platform: installation?.platform ?? null,
    status: activation.status,
    endReason: activation.endReason,
    activatedAt: activation.activatedAt.toISOString(),
    lastValidatedAt: activation.lastValidatedAt.toISOString(),
    deactivatedAt: iso(activation.deactivatedAt),
  };
}

export function toEventDto(event: SpellLicenseEvent): SpellEventDto {
  return {
    id: event.id,
    type: event.type,
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    activationId: event.activationId,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  };
}

export function transferAvailableAt(
  license: SpellLicense,
  now: Date,
  cooldownDays: number,
): string | null {
  const cooldown = evaluateCooldown(license, now, cooldownDays);
  return cooldown.blocked ? cooldown.availableAt.toISOString() : null;
}
