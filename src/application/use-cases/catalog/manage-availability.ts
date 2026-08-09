import type { ActorContext } from "@/application/common/actor-context";
import type {
  CreateAvailabilityRuleFormInput,
} from "@/application/validators/marketplace.schema";
import type { AvailabilityException, AvailabilityRule } from "@/domain/entities/availability";
import { AuditAction, UserRole } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { AvailabilityRepository } from "@/domain/repositories/availability-repository";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import { canLawyerManageOfferings } from "@/domain/services/lawyer-eligibility";

export type AvailabilityDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  availabilityRepository: AvailabilityRepository;
  auditLogRepository: AuditLogRepository;
};

async function requireLawyer(actor: ActorContext, deps: AvailabilityDeps) {
  if (actor.role !== UserRole.LAWYER) throw new ForbiddenError();
  const profile = await deps.lawyerProfileRepository.findByUserId(actor.userId);
  if (!profile) throw new NotFoundError("LawyerProfile");
  if (!canLawyerManageOfferings(profile)) {
    throw new ValidationError("Suspended lawyers cannot manage availability");
  }
  return profile;
}

export async function createAvailabilityRuleUseCase(
  actor: ActorContext,
  input: CreateAvailabilityRuleFormInput,
  deps: AvailabilityDeps,
  ipAddress?: string,
): Promise<AvailabilityRule> {
  const profile = await requireLawyer(actor, deps);
  if (input.startTime >= input.endTime) {
    throw new ValidationError("End time must be after start time");
  }
  const rule = await deps.availabilityRepository.createRule({
    lawyerProfileId: profile.id,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.CREATE,
    entityType: "AvailabilityRule",
    entityId: rule.id,
    ipAddress,
  });
  return rule;
}

export async function deleteAvailabilityRuleUseCase(
  actor: ActorContext,
  ruleId: string,
  deps: AvailabilityDeps,
  ipAddress?: string,
): Promise<void> {
  const profile = await requireLawyer(actor, deps);
  const rules = await deps.availabilityRepository.findRulesByLawyerProfileId(
    profile.id,
  );
  if (!rules.some((r) => r.id === ruleId)) {
    throw new NotFoundError("AvailabilityRule", ruleId);
  }
  await deps.availabilityRepository.deleteRule(ruleId);
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.DELETE,
    entityType: "AvailabilityRule",
    entityId: ruleId,
    ipAddress,
  });
}

export async function createAvailabilityExceptionUseCase(
  actor: ActorContext,
  input: {
    exceptionDate: string;
    startTime?: string;
    endTime?: string;
    isAvailable: boolean;
    reason?: string;
  },
  deps: AvailabilityDeps,
  ipAddress?: string,
): Promise<AvailabilityException> {
  const profile = await requireLawyer(actor, deps);
  const exception = await deps.availabilityRepository.createException({
    lawyerProfileId: profile.id,
    exceptionDate: input.exceptionDate,
    startTime: input.startTime || undefined,
    endTime: input.endTime || undefined,
    isAvailable: input.isAvailable,
    reason: input.reason,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.CREATE,
    entityType: "AvailabilityException",
    entityId: exception.id,
    ipAddress,
  });
  return exception;
}

export async function deleteAvailabilityExceptionUseCase(
  actor: ActorContext,
  exceptionId: string,
  deps: AvailabilityDeps,
  ipAddress?: string,
): Promise<void> {
  const profile = await requireLawyer(actor, deps);
  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  const exceptions =
    await deps.availabilityRepository.findExceptionsByLawyerProfileId(
      profile.id,
      from,
      toDate,
    );
  if (!exceptions.some((e) => e.id === exceptionId)) {
    throw new NotFoundError("AvailabilityException", exceptionId);
  }
  await deps.availabilityRepository.deleteException(exceptionId);
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.DELETE,
    entityType: "AvailabilityException",
    entityId: exceptionId,
    ipAddress,
  });
}
