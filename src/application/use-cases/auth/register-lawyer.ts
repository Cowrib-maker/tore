import bcrypt from "bcryptjs";

import type { RegisterLawyerInput } from "@/application/validators/auth.schema";
import { PLATFORM_SETTING_KEYS } from "@/domain/constants/platform-settings";
import type { User } from "@/domain/entities/user";
import { AuditAction, UserRole } from "@/domain/enums";
import { ConflictError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import type { TermsAcceptanceRepository } from "@/domain/repositories/terms-acceptance-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { generateLawyerSlug } from "@/domain/services/slug-generator";

export type RegisterLawyerDeps = {
  userRepository: UserRepository;
  lawyerProfileRepository: LawyerProfileRepository;
  termsAcceptanceRepository: TermsAcceptanceRepository;
  platformSettingRepository: PlatformSettingRepository;
  auditLogRepository: AuditLogRepository;
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

export async function registerLawyerUseCase(
  input: RegisterLawyerInput,
  deps: RegisterLawyerDeps,
  ipAddress?: string,
): Promise<User> {
  const exists = await deps.userRepository.emailExists(input.email);
  if (exists) {
    throw new ConflictError("An account with this email already exists");
  }

  const settings = await deps.platformSettingRepository.findMany([
    PLATFORM_SETTING_KEYS.TERMS_VERSION,
    PLATFORM_SETTING_KEYS.PRIVACY_VERSION,
    PLATFORM_SETTING_KEYS.MARKETPLACE_DISCLAIMER_VERSION,
  ]);
  const settingByKey = Object.fromEntries(
    settings.map((setting) => [setting.key, setting]),
  );

  const termsVersion =
    settingByKey[PLATFORM_SETTING_KEYS.TERMS_VERSION]?.value ?? "2026-08-01";
  const privacyVersion =
    settingByKey[PLATFORM_SETTING_KEYS.PRIVACY_VERSION]?.value ?? "2026-08-01";
  const marketplaceDisclaimerVersion =
    settingByKey[PLATFORM_SETTING_KEYS.MARKETPLACE_DISCLAIMER_VERSION]?.value ??
    "2026-08-01";

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await deps.userRepository.create({
    email: input.email,
    name: input.name,
    passwordHash,
    role: UserRole.LAWYER,
    preferredLanguage: input.preferredLanguage,
  });

  const slug = await allocateUniqueLawyerSlug(
    input.name,
    deps.lawyerProfileRepository,
  );

  await deps.lawyerProfileRepository.create({
    userId: user.id,
    slug,
  });

  await deps.termsAcceptanceRepository.createBundle({
    userId: user.id,
    termsVersion,
    privacyVersion,
    marketplaceDisclaimerVersion,
    ipAddress,
  });

  await deps.auditLogRepository.create({
    actorUserId: user.id,
    action: AuditAction.CREATE,
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
    ipAddress,
  });

  return user;
}
