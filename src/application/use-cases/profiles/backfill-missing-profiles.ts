import { AuditAction, UserRole } from "@/domain/enums";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type {
  ClientProfileRepository,
  LawyerProfileRepository,
} from "@/domain/repositories/profile-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { ConflictError } from "@/domain/errors/domain-error";
import { generateLawyerSlug } from "@/domain/services/slug-generator";

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

async function allocateUniqueLawyerSlug(
  displayName: string,
  lawyerProfileRepository: LawyerProfileRepository,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = generateLawyerSlug(displayName);
    const taken = await lawyerProfileRepository.slugExists(slug);
    if (!taken) {
      return slug;
    }
  }

  throw new ConflictError("Could not allocate a unique lawyer profile slug");
}

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

    await deps.clientProfileRepository.create({ userId: user.id });
    await deps.auditLogRepository.create({
      actorUserId: user.id,
      action: AuditAction.CREATE,
      entityType: "ClientProfile",
      entityId: user.id,
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

    const slug = await allocateUniqueLawyerSlug(
      user.name ?? user.email,
      deps.lawyerProfileRepository,
    );

    const profile = await deps.lawyerProfileRepository.create({
      userId: user.id,
      slug,
    });

    await deps.auditLogRepository.create({
      actorUserId: user.id,
      action: AuditAction.CREATE,
      entityType: "LawyerProfile",
      entityId: profile.id,
      metadata: {
        source: "backfill-missing-profiles",
        userId: user.id,
        slug,
      },
    });
    result.lawyersCreated += 1;
  }

  return result;
}
