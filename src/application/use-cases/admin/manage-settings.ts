import type { ActorContext } from "@/application/common/actor-context";
import type { PlatformSetting } from "@/domain/entities/platform-setting";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";

export type ManageSettingsDeps = {
  platformSettingRepository: PlatformSettingRepository;
  auditLogRepository: AuditLogRepository;
};

export async function listPlatformSettingsUseCase(
  actor: ActorContext,
  deps: Pick<ManageSettingsDeps, "platformSettingRepository">,
): Promise<PlatformSetting[]> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  return deps.platformSettingRepository.findAll();
}

export async function updatePlatformSettingUseCase(
  actor: ActorContext,
  input: { key: string; value: string },
  deps: ManageSettingsDeps,
): Promise<PlatformSetting> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  if (!input.value.trim()) {
    throw new ValidationError("Value is required");
  }

  const existing = await deps.platformSettingRepository.findByKey(input.key);
  if (!existing) {
    throw new ValidationError("Unknown setting");
  }

  const updated = await deps.platformSettingRepository.updateValue(
    input.key,
    input.value.trim(),
    actor.userId,
  );

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "PlatformSetting",
    entityId: input.key,
    metadata: { previousValue: existing.value, newValue: updated.value },
  });

  return updated;
}
