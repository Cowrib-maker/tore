import { AuditAction, UserRole } from "@/domain/enums";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type {
  ClientProfileRepository,
  LawyerProfileRepository,
} from "@/domain/repositories/profile-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { createLawyerProfileWithUniqueSlug } from "@/domain/services/allocate-lawyer-slug";

export type BackfillMissingProfilesDeps = {
  userRepository: UserRepository;
  clientProfileRepository: ClientProfileRepository;
  lawyerProfileRepository: LawyerProfileRepository;
  auditLogRepository: AuditLogRepository;
};

export type BackfillMissingProfilesResult = {
  clientsCreated: number;
  lawyersCreated: number;
  clientsSkipped: number;
  lawyersSkipped: number;
};

/**
 * Creates missing ClientProfile / LawyerProfile rows for existing users
 * (Sprint 1 orphans). Idempotent: skips users that already have a profile.
 */
export async function backfillMissingProfilesUseCase(
  deps: BackfillMissingProfilesDeps,
): Promise<BackfillMissingProfilesResult> {
  const result: BackfillMissingProfilesResult = {
    clientsCreated: 0,
    lawyersCreated: 0,
    clientsSkipped: 0,
    lawyersSkipped: 0,
  };

  const clients = await deps.userRepository.findByRole(UserRole.CLIENT);
  for (const user of clients) {
    const existing = await deps.clientProfileRepository.findByUserId(user.id);
    if (existing) {
      result.clientsSkipped += 1;
      continue;
    }

    const profile = await deps.clientProfileRepository.create({
      userId: user.id,
    });
    await deps.auditLogRepository.create({
      actorUserId: user.id,
      action: AuditAction.CREATE,
      entityType: "ClientProfile",
      entityId: profile.id,
      metadata: { source: "backfill-missing-profiles", userId: user.id },
    });
    result.clientsCreated += 1;
  }

  const lawyers = await deps.userRepository.findByRole(UserRole.LAWYER);
  for (const user of lawyers) {
    const existing = await deps.lawyerProfileRepository.findByUserId(user.id);
    if (existing) {
      result.lawyersSkipped += 1;
      continue;
    }

    const profile = await createLawyerProfileWithUniqueSlug(
      user.name ?? user.email,
      user.id,
      deps.lawyerProfileRepository,
    );

    await deps.auditLogRepository.create({
      actorUserId: user.id,
      action: AuditAction.CREATE,
      entityType: "LawyerProfile",
      entityId: profile.id,
      metadata: {
        source: "backfill-missing-profiles",
        userId: user.id,
        slug: profile.slug,
      },
    });
    result.lawyersCreated += 1;
  }

  return result;
}
