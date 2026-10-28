import type { ActorContext } from "@/application/common/actor-context";
import { AuditAction, UserRole, UserStatus } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import { getSpellPlan, isSpellPlanCode } from "@/domain/spell/plans";
import {
  SpellActivationEndReason,
  SpellActivationStatus,
  SpellActorType,
  SpellEventType,
  SpellLicenseSource,
  type SpellLicenseStatus,
  type SpellPlanCode,
} from "@/domain/spell/enums";
import {
  generateCanonicalLicenseCode,
  formatLicenseCode,
  licenseCodeHint,
} from "@/domain/spell/license-code";
import { addDays } from "@/domain/spell/license-state";
import { randomUUID } from "node:crypto";
import type { SpellAdminDeps } from "./deps";
import {
  toActivationDto,
  toEventDto,
  toLicenseDto,
  transferAvailableAt,
  type SpellActivationDto,
  type SpellEventDto,
  type SpellLicenseDto,
} from "./dto";

function assertAdmin(actor: ActorContext): void {
  if (actor.role !== UserRole.ADMIN) throw new ForbiddenError();
}

/**
 * Secondary, human-facing trail in the platform AuditLog. The immutable
 * SpellLicenseEvent (written in the same transaction as the change) is the
 * authoritative record, so a failure here is logged and must not undo or fail
 * an already-committed admin action.
 */
async function mirrorToAuditLog(
  deps: Pick<SpellAdminDeps, "auditLogRepository">,
  actor: ActorContext,
  action: AuditAction,
  licenseId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await deps.auditLogRepository.create({
      actorUserId: actor.userId,
      action,
      entityType: "SpellLicense",
      entityId: licenseId,
      metadata,
    });
  } catch {
    console.error("[spell] failed to mirror admin action to audit log");
  }
}

const REASON_MAX = 500;

function cleanReason(reason: unknown): string {
  if (typeof reason !== "string" || !reason.trim()) {
    throw new ValidationError("A reason is required");
  }
  return reason.trim().slice(0, REASON_MAX);
}

export type IssueSpellLicenseInput = {
  planCode: SpellPlanCode;
  ownerUserId?: string | null;
  source?: SpellLicenseSource;
};

/**
 * Admin-issued licence. The ONLY place the plaintext code exists server-side
 * outside the owner-reveal path: it is returned once to the issuing admin and
 * never logged or audited. `PURCHASE` is reserved for the payment flow.
 */
export async function issueSpellLicense(
  actor: ActorContext,
  input: IssueSpellLicenseInput,
  deps: SpellAdminDeps,
  now: Date = new Date(),
): Promise<{ license: SpellLicenseDto; code: string }> {
  assertAdmin(actor);
  if (!isSpellPlanCode(input.planCode)) {
    throw new ValidationError("Unknown Spell plan");
  }
  const source = input.source ?? SpellLicenseSource.ADMIN_ISSUED;
  if (
    source !== SpellLicenseSource.ADMIN_ISSUED &&
    source !== SpellLicenseSource.PROMO
  ) {
    throw new ValidationError("Unsupported license source");
  }
  const plan = getSpellPlan(input.planCode);

  if (input.ownerUserId) {
    const owner = await deps.userRepository.findById(input.ownerUserId);
    if (!owner || owner.deletedAt || owner.status !== UserStatus.ACTIVE) {
      throw new NotFoundError("User");
    }
  }

  const canonical = generateCanonicalLicenseCode(deps.randomBytes);
  const id = randomUUID();
  const { hash, keyId } = deps.vault.hashForStorage(canonical);
  const { ciphertext, keyVersion } = deps.vault.encrypt(canonical, id);

  const license = await deps.unitOfWork.runInTransaction(async (repos) => {
    const created = await repos.licenseRepository.create({
      id,
      product: plan.product,
      planCode: plan.code,
      durationMonths: plan.durationMonths,
      source,
      ownerUserId: input.ownerUserId ?? null,
      codeHash: hash,
      codeHashKeyId: keyId,
      codeCiphertext: ciphertext,
      codeEncKeyVersion: keyVersion,
      codeHint: licenseCodeHint(canonical),
      redeemBy: addDays(now, deps.policy.redeemByDays),
      issuedByUserId: actor.userId,
      purchaseInvoiceId: null,
    });
    await repos.eventRepository.append({
      licenseId: created.id,
      type: SpellEventType.LICENSE_ISSUED,
      actorType: SpellActorType.ADMIN,
      actorUserId: actor.userId,
      metadata: {
        planCode: plan.code,
        durationMonths: plan.durationMonths,
        source,
        ownerUserId: input.ownerUserId ?? null,
        redeemBy: created.redeemBy.toISOString(),
      },
      createdAt: now,
    });
    return created;
  });

  await mirrorToAuditLog(deps, actor, AuditAction.CREATE, license.id, {
    spellAction: "LICENSE_ISSUED",
    planCode: plan.code,
    ownerUserId: input.ownerUserId ?? null,
  });
  return {
    license: toLicenseDto(license, now),
    code: formatLicenseCode(canonical),
  };
}

export async function listSpellLicenses(
  actor: ActorContext,
  filters: {
    status?: SpellLicenseStatus;
    planCode?: SpellPlanCode;
    source?: SpellLicenseSource;
    ownerUserId?: string;
    limit: number;
    offset: number;
  },
  deps: SpellAdminDeps,
  now: Date = new Date(),
): Promise<{ items: SpellLicenseDto[]; total: number }> {
  assertAdmin(actor);
  const { items, total } = await deps.repos.licenseRepository.list({
    ...filters,
    limit: Math.min(Math.max(filters.limit, 1), 100),
    offset: Math.max(filters.offset, 0),
  });
  return { items: items.map((l) => toLicenseDto(l, now)), total };
}

export type AdminLicenseDetail = {
  license: SpellLicenseDto;
  transferAvailableAt: string | null;
  activations: SpellActivationDto[];
  events: SpellEventDto[];
};

export async function getSpellLicenseDetail(
  actor: ActorContext,
  licenseId: string,
  deps: SpellAdminDeps,
  now: Date = new Date(),
): Promise<AdminLicenseDetail> {
  assertAdmin(actor);
  const license = await deps.repos.licenseRepository.findById(licenseId);
  if (!license) throw new NotFoundError("License");
  const [activations, events] = await Promise.all([
    deps.repos.activationRepository.listByLicenseId(license.id),
    deps.repos.eventRepository.listByLicenseId(license.id),
  ]);
  const withInstallation = await Promise.all(
    activations.map(async (a) =>
      toActivationDto(a, await deps.repos.installationRepository.findById(a.installationId)),
    ),
  );
  return {
    license: toLicenseDto(license, now),
    transferAvailableAt: transferAvailableAt(license, now, deps.policy.transferCooldownDays),
    activations: withInstallation,
    events: events.map(toEventDto),
  };
}

/** Revoke a license and end its active activation. Idempotent. */
export async function revokeSpellLicense(
  actor: ActorContext,
  licenseId: string,
  reason: unknown,
  deps: SpellAdminDeps,
  now: Date = new Date(),
): Promise<{ revoked: boolean }> {
  assertAdmin(actor);
  const cleaned = cleanReason(reason);
  const revoked = await deps.unitOfWork.runInTransaction(async (repos) => {
    const license = await repos.licenseRepository.findById(licenseId);
    if (!license) throw new NotFoundError("License");
    if (!(await repos.licenseRepository.revoke(licenseId, now, cleaned))) {
      return false;
    }
    await repos.eventRepository.append({
      licenseId,
      type: SpellEventType.LICENSE_REVOKED,
      actorType: SpellActorType.ADMIN,
      actorUserId: actor.userId,
      metadata: { reason: cleaned },
      createdAt: now,
    });
    const active = await repos.activationRepository.findActiveByLicenseId(licenseId);
    if (
      active &&
      (await repos.activationRepository.end({
        id: active.id,
        status: SpellActivationStatus.REVOKED,
        reason: SpellActivationEndReason.LICENSE_REVOKED,
        at: now,
      }))
    ) {
      await repos.eventRepository.append({
        licenseId,
        activationId: active.id,
        type: SpellEventType.ACTIVATION_REVOKED,
        actorType: SpellActorType.ADMIN,
        actorUserId: actor.userId,
        metadata: { reason: "LICENSE_REVOKED" },
        createdAt: now,
      });
    }
    return true;
  });
  if (revoked) {
    await mirrorToAuditLog(deps, actor, AuditAction.UPDATE, licenseId, {
      spellAction: "LICENSE_REVOKED",
      reason: cleaned,
    });
  }
  return { revoked };
}

/**
 * Admin override of the self-service cooldown: clears the last-device-change
 * marker so the owner can move the license now. The admin cannot move it for
 * them (only a device holding a key can activate), which is intentional.
 */
export async function resetSpellTransferCooldown(
  actor: ActorContext,
  licenseId: string,
  reason: unknown,
  deps: SpellAdminDeps,
  now: Date = new Date(),
): Promise<void> {
  assertAdmin(actor);
  const cleaned = cleanReason(reason);
  await deps.unitOfWork.runInTransaction(async (repos) => {
    const license = await repos.licenseRepository.findById(licenseId);
    if (!license) throw new NotFoundError("License");
    await repos.licenseRepository.setLastDeviceChangeAt(licenseId, null);
    await repos.eventRepository.append({
      licenseId,
      type: SpellEventType.TRANSFER_COOLDOWN_OVERRIDDEN,
      actorType: SpellActorType.ADMIN,
      actorUserId: actor.userId,
      metadata: {
        reason: cleaned,
        previousLastDeviceChangeAt: license.lastDeviceChangeAt?.toISOString() ?? null,
      },
      createdAt: now,
    });
  });
  await mirrorToAuditLog(deps, actor, AuditAction.UPDATE, licenseId, {
    spellAction: "TRANSFER_COOLDOWN_OVERRIDDEN",
    reason: cleaned,
  });
}

/** Support action: free the license from whichever computer holds it. */
export async function adminDeactivateSpellActivation(
  actor: ActorContext,
  licenseId: string,
  reason: unknown,
  deps: SpellAdminDeps,
  now: Date = new Date(),
): Promise<{ deactivated: boolean }> {
  assertAdmin(actor);
  const cleaned = cleanReason(reason);
  const result = await deps.unitOfWork.runInTransaction(async (repos) => {
    const license = await repos.licenseRepository.findById(licenseId);
    if (!license) throw new NotFoundError("License");
    const active = await repos.activationRepository.findActiveByLicenseId(licenseId);
    if (!active) return { deactivated: false };
    const ended = await repos.activationRepository.end({
      id: active.id,
      status: SpellActivationStatus.DEACTIVATED,
      reason: SpellActivationEndReason.ADMIN_DEACTIVATED,
      at: now,
    });
    if (ended) {
      await repos.eventRepository.append({
        licenseId,
        activationId: active.id,
        type: SpellEventType.ACTIVATION_DEACTIVATED,
        actorType: SpellActorType.ADMIN,
        actorUserId: actor.userId,
        metadata: { reason: cleaned },
        createdAt: now,
      });
    }
    return { deactivated: ended };
  });
  if (result.deactivated) {
    await mirrorToAuditLog(deps, actor, AuditAction.UPDATE, licenseId, {
      spellAction: "ACTIVATION_DEACTIVATED_BY_ADMIN",
      reason: cleaned,
    });
  }
  return result;
}
