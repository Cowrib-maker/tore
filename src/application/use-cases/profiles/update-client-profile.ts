import type { UpdateClientProfileFormInput } from "@/application/validators/profile.schema";
import type { ClientProfile } from "@/domain/entities/profile";
import { AuditAction } from "@/domain/enums";
import { NotFoundError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { ClientProfileRepository } from "@/domain/repositories/profile-repository";

export type UpdateClientProfileDeps = {
  clientProfileRepository: ClientProfileRepository;
  auditLogRepository: AuditLogRepository;
};

export async function updateClientProfileUseCase(
  userId: string,
  input: UpdateClientProfileFormInput,
  deps: UpdateClientProfileDeps,
  ipAddress?: string,
): Promise<ClientProfile> {
  const existing = await deps.clientProfileRepository.findByUserId(userId);
  if (!existing) {
    throw new NotFoundError("ClientProfile");
  }

  const updated = await deps.clientProfileRepository.update(existing.id, {
    phone: input.phone,
    companyName: input.companyName,
  });

  await deps.auditLogRepository.create({
    actorUserId: userId,
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
