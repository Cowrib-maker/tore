import bcrypt from "bcryptjs";

import { provisionPersonalTenantOnRegister } from "@/application/use-cases/auth/provision-personal-tenant-on-register";
import type { RegisterClientInput } from "@/application/validators/auth.schema";
import { PLATFORM_SETTING_KEYS } from "@/domain/constants/platform-settings";
import type { User } from "@/domain/entities/user";
import { AuditAction, UserRole } from "@/domain/enums";
import { ConflictError } from "@/domain/errors/domain-error";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type RegisterClientDeps = {
  userRepository: UserRepository;
  platformSettingRepository: PlatformSettingRepository;
  unitOfWork: UnitOfWork;
};

export async function registerClientUseCase(
  input: RegisterClientInput,
  deps: RegisterClientDeps,
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

  return deps.unitOfWork.runInTransaction(async (repos) => {
    const user = await repos.userRepository.create({
      email: input.email,
      name: input.name,
      passwordHash,
      role: UserRole.CLIENT,
      preferredLanguage: input.preferredLanguage,
    });

    await repos.clientProfileRepository.create({
      userId: user.id,
    });

    await repos.termsAcceptanceRepository.createBundle({
      userId: user.id,
      termsVersion,
      privacyVersion,
      marketplaceDisclaimerVersion,
      ipAddress,
    });

    await repos.auditLogRepository.create({
      actorUserId: user.id,
      action: AuditAction.CREATE,
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ipAddress,
    });

    // Flag-gated: same UoW so failed ensure rolls back the new user.
    return provisionPersonalTenantOnRegister(user, repos.tenantRepository);
  });
}
