import type { ActorContext } from "@/application/common/actor-context";
import type {
  CreateLanguageFormInput,
  CreatePracticeAreaFormInput,
  UpdateLanguageFormInput,
  UpdatePracticeAreaFormInput,
} from "@/application/validators/admin-taxonomy.schema";
import type { Language, PracticeArea } from "@/domain/entities/taxonomy";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type {
  LanguageRepository,
  PracticeAreaRepository,
} from "@/domain/repositories/taxonomy-repository";

export type ManageTaxonomyDeps = {
  practiceAreaRepository: PracticeAreaRepository;
  languageRepository: LanguageRepository;
  auditLogRepository: AuditLogRepository;
};

function assertAdmin(actor: ActorContext) {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
}

export async function createPracticeAreaUseCase(
  actor: ActorContext,
  input: CreatePracticeAreaFormInput,
  deps: ManageTaxonomyDeps,
): Promise<PracticeArea> {
  assertAdmin(actor);
  const created = await deps.practiceAreaRepository.create(input);
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.CREATE,
    entityType: "PracticeArea",
    entityId: created.id,
  });
  return created;
}

export async function updatePracticeAreaUseCase(
  actor: ActorContext,
  input: UpdatePracticeAreaFormInput,
  deps: ManageTaxonomyDeps,
): Promise<PracticeArea> {
  assertAdmin(actor);
  const updated = await deps.practiceAreaRepository.update(input.id, {
    nameMn: input.nameMn,
    nameEn: input.nameEn,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "PracticeArea",
    entityId: updated.id,
  });
  return updated;
}

export async function togglePracticeAreaActiveUseCase(
  actor: ActorContext,
  input: { id: string; isActive: boolean },
  deps: ManageTaxonomyDeps,
): Promise<PracticeArea> {
  assertAdmin(actor);
  const updated = await deps.practiceAreaRepository.update(input.id, {
    isActive: input.isActive,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "PracticeArea",
    entityId: updated.id,
    metadata: { isActive: input.isActive },
  });
  return updated;
}

export async function createLanguageUseCase(
  actor: ActorContext,
  input: CreateLanguageFormInput,
  deps: ManageTaxonomyDeps,
): Promise<Language> {
  assertAdmin(actor);
  const created = await deps.languageRepository.create(input);
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.CREATE,
    entityType: "Language",
    entityId: created.id,
  });
  return created;
}

export async function updateLanguageUseCase(
  actor: ActorContext,
  input: UpdateLanguageFormInput,
  deps: ManageTaxonomyDeps,
): Promise<Language> {
  assertAdmin(actor);
  const updated = await deps.languageRepository.update(input.id, {
    nameMn: input.nameMn,
    nameEn: input.nameEn,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "Language",
    entityId: updated.id,
  });
  return updated;
}

export async function toggleLanguageActiveUseCase(
  actor: ActorContext,
  input: { id: string; isActive: boolean },
  deps: ManageTaxonomyDeps,
): Promise<Language> {
  assertAdmin(actor);
  const updated = await deps.languageRepository.update(input.id, {
    isActive: input.isActive,
  });
  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "Language",
    entityId: updated.id,
    metadata: { isActive: input.isActive },
  });
  return updated;
}
