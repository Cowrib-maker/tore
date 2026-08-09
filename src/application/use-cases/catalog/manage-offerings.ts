import type { ActorContext } from "@/application/common/actor-context";
import type { UpsertOfferingInput } from "@/application/validators/marketplace.schema";
import type { ConsultationOffering } from "@/domain/entities/consultation-offering";
import { AuditAction, UserRole } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { ConsultationOfferingRepository } from "@/domain/repositories/consultation-offering-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import { canLawyerManageOfferings } from "@/domain/services/lawyer-eligibility";

export type OfferingDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  consultationOfferingRepository: ConsultationOfferingRepository;
  auditLogRepository: AuditLogRepository;
};

async function requireLawyerProfile(
  actor: ActorContext,
  deps: OfferingDeps,
) {
  if (actor.role !== UserRole.LAWYER) throw new ForbiddenError();
  const profile = await deps.lawyerProfileRepository.findByUserId(actor.userId);
  if (!profile) throw new NotFoundError("LawyerProfile");
  if (!canLawyerManageOfferings(profile)) {
    throw new ValidationError("Suspended lawyers cannot manage offerings");
  }
  return profile;
}

export async function createOfferingUseCase(
  actor: ActorContext,
  input: UpsertOfferingInput,
  deps: OfferingDeps,
  ipAddress?: string,
): Promise<ConsultationOffering> {
  const profile = await requireLawyerProfile(actor, deps);
  const offering = await deps.consultationOfferingRepository.create({
    lawyerProfileId: profile.id,
    titleMn: input.titleMn,
    titleEn: input.titleEn || undefined,
    descriptionMn: input.descriptionMn || undefined,
    durationMinutes: input.durationMinutes,
    priceMnt: input.priceMnt,
    modality: input.modality,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.CREATE,
    entityType: "ConsultationOffering",
    entityId: offering.id,
    metadata: { priceMnt: offering.priceMnt, modality: offering.modality },
    ipAddress,
  });
  return offering;
}

export async function updateOfferingUseCase(
  actor: ActorContext,
  offeringId: string,
  input: UpsertOfferingInput,
  deps: OfferingDeps,
  ipAddress?: string,
): Promise<ConsultationOffering> {
  const profile = await requireLawyerProfile(actor, deps);
  const existing = await deps.consultationOfferingRepository.findById(offeringId);
  if (!existing || existing.lawyerProfileId !== profile.id) {
    throw new NotFoundError("ConsultationOffering", offeringId);
  }
  const offering = await deps.consultationOfferingRepository.update(offeringId, {
    titleMn: input.titleMn,
    titleEn: input.titleEn || null,
    descriptionMn: input.descriptionMn || null,
    durationMinutes: input.durationMinutes,
    priceMnt: input.priceMnt,
    modality: input.modality,
    isActive: input.isActive,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "ConsultationOffering",
    entityId: offering.id,
    ipAddress,
  });
  return offering;
}

export async function deleteOfferingUseCase(
  actor: ActorContext,
  offeringId: string,
  deps: OfferingDeps,
  ipAddress?: string,
): Promise<void> {
  const profile = await requireLawyerProfile(actor, deps);
  const existing = await deps.consultationOfferingRepository.findById(offeringId);
  if (!existing || existing.lawyerProfileId !== profile.id) {
    throw new NotFoundError("ConsultationOffering", offeringId);
  }
  await deps.consultationOfferingRepository.softDelete(offeringId);
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.DELETE,
    entityType: "ConsultationOffering",
    entityId: offeringId,
    ipAddress,
  });
}
