import type { ActorContext } from "@/application/common/actor-context";
import type {
  SetHomepageSectionImageFormInput,
} from "@/application/validators/homepage.schema";
import type { HomepageSection } from "@/domain/entities/homepage-section";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { HomepageSectionRepository } from "@/domain/repositories/homepage-section-repository";

export type ManageHomepageDeps = {
  homepageSectionRepository: HomepageSectionRepository;
  auditLogRepository: AuditLogRepository;
  fileStorage: FileStorage;
};

export type HomepageImageUpload = {
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export async function listHomepageSectionsUseCase(
  actor: ActorContext,
  deps: Pick<ManageHomepageDeps, "homepageSectionRepository">,
): Promise<HomepageSection[]> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  return deps.homepageSectionRepository.findAll();
}

export async function setHomepageSectionImageUseCase(
  actor: ActorContext,
  input: SetHomepageSectionImageFormInput,
  image: HomepageImageUpload,
  deps: ManageHomepageDeps,
  ipAddress?: string,
): Promise<HomepageSection> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const existing = (await deps.homepageSectionRepository.findAll()).find(
    (section) => section.key === input.key,
  );

  const stored = await deps.fileStorage.upload({
    purpose: "homepage-image",
    ownerId: input.key,
    fileName: image.fileName,
    contentType: image.contentType,
    body: image.body,
  });

  const section = await deps.homepageSectionRepository.setImage(
    input.key,
    stored.key,
    actor.userId,
  );

  if (existing?.imageKey) {
    await deps.fileStorage.delete(existing.imageKey).catch(() => undefined);
  }

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "HomepageSection",
    entityId: input.key,
    metadata: { imageKey: stored.key },
    ipAddress,
  });

  return section;
}

export async function clearHomepageSectionImageUseCase(
  actor: ActorContext,
  input: SetHomepageSectionImageFormInput,
  deps: Omit<ManageHomepageDeps, "fileStorage"> & { fileStorage: FileStorage },
  ipAddress?: string,
): Promise<HomepageSection> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const existing = (await deps.homepageSectionRepository.findAll()).find(
    (section) => section.key === input.key,
  );

  const section = await deps.homepageSectionRepository.setImage(
    input.key,
    null,
    actor.userId,
  );

  if (existing?.imageKey) {
    await deps.fileStorage.delete(existing.imageKey).catch(() => undefined);
  }

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "HomepageSection",
    entityId: input.key,
    metadata: { imageKey: null },
    ipAddress,
  });

  return section;
}
