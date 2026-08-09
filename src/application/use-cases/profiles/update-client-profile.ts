import type { ActorContext } from "@/application/common/actor-context";
import type { UpdateClientProfileFormInput } from "@/application/validators/profile.schema";
import type { ClientProfile } from "@/domain/entities/profile";
import { AuditAction, UserRole } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
} from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { ClientProfileRepository } from "@/domain/repositories/profile-repository";

export type UpdateClientProfileDeps = {
  clientProfileRepository: ClientProfileRepository;
  auditLogRepository: AuditLogRepository;
};

export async function updateClientProfileUseCase(
  actor: ActorContext,
  input: UpdateClientProfileFormInput,
  deps: UpdateClientProfileDeps,
  ipAddress?: string,
): Promise<ClientProfile> {
  if (actor.role !== UserRole.CLIENT) {
    throw new ForbiddenError();
  }

  const existing = await deps.clientProfileRepository.findByUserId(
    actor.userId,
  );
  if (!existing) {
    throw new NotFoundError("ClientProfile");
  }

  if (existing.userId !== actor.userId) {
    throw new ForbiddenError();
  }

  const updated = await deps.clientProfileRepository.update(existing.id, {
    phone: input.phone,
    companyName: input.companyName,
  });

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "ClientProfile",
    entityId: updated.id,
    metadata: {
      phone: updated.phone,
      companyName: updated.companyName,
    },
    ipAddress,
  });

  return updated;
}
