import bcrypt from "bcryptjs";

import type { RegisterClientInput } from "@/application/validators/auth.schema";
import { PLATFORM_SETTING_KEYS } from "@/domain/constants/platform-settings";
import type { User } from "@/domain/entities/user";
import { AuditAction, UserRole } from "@/domain/enums";
import { ConflictError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { ClientProfileRepository } from "@/domain/repositories/profile-repository";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import type { TermsAcceptanceRepository } from "@/domain/repositories/terms-acceptance-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type RegisterClientDeps = {
  userRepository: UserRepository;
  clientProfileRepository: ClientProfileRepository;
  termsAcceptanceRepository: TermsAcceptanceRepository;
  platformSettingRepository: PlatformSettingRepository;
  auditLogRepository: AuditLogRepository;
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

  const user = await deps.userRepository.create({
    email: input.email,
    name: input.name,
    passwordHash,
    role: UserRole.CLIENT,
    preferredLanguage: input.preferredLanguage,
  });

  await deps.clientProfileRepository.create({
    userId: user.id,
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
