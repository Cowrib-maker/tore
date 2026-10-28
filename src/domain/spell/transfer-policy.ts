import type { SpellActivation, SpellLicense } from "./entities";

export type DeviceChangeDecision =
  /** No activation has ever existed for this license. Starts the term clock. */
  | { kind: "FIRST_ACTIVATION" }
  /** This installation already holds the ACTIVE activation. Idempotent. */
  | { kind: "ALREADY_ACTIVE"; activation: SpellActivation }
  /** Same installation as the most recent activation, which is no longer active. */
  | { kind: "REACTIVATION" }
  /**
   * Another installation holds the ACTIVE activation. Moving requires an
   * explicit, informed confirmation naming the activation being replaced.
   */
  | {
      kind: "TRANSFER";
      replacing: SpellActivation;
      cooldown: CooldownStatus;
    }
  /** Different installation than last time, but nothing is currently active. */
  | { kind: "DEVICE_CHANGE"; cooldown: CooldownStatus };

export type CooldownStatus =
  | { blocked: false }
  | { blocked: true; availableAt: Date };

export function evaluateCooldown(
  license: Pick<SpellLicense, "lastDeviceChangeAt">,
  now: Date,
  cooldownDays: number,
): CooldownStatus {
  if (!license.lastDeviceChangeAt || cooldownDays <= 0) {
    return { blocked: false };
  }
  const availableAt = new Date(
    license.lastDeviceChangeAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000,
  );
  return now.getTime() < availableAt.getTime()
    ? { blocked: true, availableAt }
    : { blocked: false };
}

/**
 * Pure classification of an activation request. The cooldown applies to every
 * change of device, whether the previous device was still active (TRANSFER) or
 * had been deactivated first (DEVICE_CHANGE) — otherwise "deactivate, then
 * activate elsewhere" would bypass it. Re-activating the same installation
 * never counts as a device change. The first activation is free.
 */
export function classifyActivationRequest(input: {
  license: Pick<SpellLicense, "lastDeviceChangeAt">;
  installationId: string;
  activeActivation: SpellActivation | null;
  latestActivation: SpellActivation | null;
  now: Date;
  cooldownDays: number;
}): DeviceChangeDecision {
  const { activeActivation, latestActivation, installationId } = input;

  if (activeActivation) {
    if (activeActivation.installationId === installationId) {
      return { kind: "ALREADY_ACTIVE", activation: activeActivation };
    }
    return {
      kind: "TRANSFER",
      replacing: activeActivation,
      cooldown: evaluateCooldown(input.license, input.now, input.cooldownDays),
    };
  }
  if (!latestActivation) {
    return { kind: "FIRST_ACTIVATION" };
  }
  if (latestActivation.installationId === installationId) {
    return { kind: "REACTIVATION" };
  }
  return {
    kind: "DEVICE_CHANGE",
    cooldown: evaluateCooldown(input.license, input.now, input.cooldownDays),
  };
}
