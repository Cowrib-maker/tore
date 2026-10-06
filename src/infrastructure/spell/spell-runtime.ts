import { randomBytes } from "node:crypto";

import { spellErrors } from "@/domain/spell/errors";
import { isSpellV1Enabled } from "@/lib/feature-flags";
import { prisma } from "@/infrastructure/database/prisma";
import { spellUnitOfWork } from "@/infrastructure/database/prisma-spell-unit-of-work";
import {
  auditLogRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { PrismaSpellActivationRepository } from "@/infrastructure/repositories/prisma-spell-activation-repository";
import { PrismaSpellLicenseEventRepository } from "@/infrastructure/repositories/prisma-spell-event-repository";
import {
  PrismaSpellAttemptRepository,
  PrismaSpellNonceRepository,
} from "@/infrastructure/repositories/prisma-spell-guard-repository";
import { PrismaSpellInstallationRepository } from "@/infrastructure/repositories/prisma-spell-installation-repository";
import { PrismaSpellLicenseRepository } from "@/infrastructure/repositories/prisma-spell-license-repository";
import type { SpellAdminDeps } from "@/application/use-cases/spell/deps";
import { KeyRingSpellCodeVault } from "./code-vault";
import { JoseSpellTokenIssuer } from "./entitlement-token";
import { parseSpellConfig, SpellConfigError } from "./spell-config";

export type SpellRuntime = {
  deps: SpellAdminDeps;
  tokenIssuer: JoseSpellTokenIssuer;
};

let cached: SpellRuntime | null = null;

/**
 * The composition root for Spell. Throws SpellError(404) while the feature
 * flag is off and SpellError(503) when enabled but misconfigured (variable
 * names are logged, values never are). Memoised after the first success.
 */
export function getSpellRuntime(): SpellRuntime {
  if (!isSpellV1Enabled()) throw spellErrors.disabled();
  if (cached) return cached;

  let config;
  try {
    config = parseSpellConfig(process.env);
  } catch (error) {
    if (error instanceof SpellConfigError) {
      console.error("[spell]", error.message);
    }
    throw spellErrors.notConfigured();
  }

  const tokenIssuer = new JoseSpellTokenIssuer(config.signing);
  const vault = new KeyRingSpellCodeVault(
    config.codeHmacKeys,
    config.codeEncryptionKeys,
  );
  const deps: SpellAdminDeps = {
    unitOfWork: spellUnitOfWork,
    repos: {
      licenseRepository: new PrismaSpellLicenseRepository(prisma),
      installationRepository: new PrismaSpellInstallationRepository(prisma),
      activationRepository: new PrismaSpellActivationRepository(prisma),
      eventRepository: new PrismaSpellLicenseEventRepository(prisma),
    },
    attemptRepository: new PrismaSpellAttemptRepository(prisma),
    nonceRepository: new PrismaSpellNonceRepository(prisma),
    vault,
    tokenIssuer,
    policy: config.policy,
    userRepository,
    auditLogRepository,
    randomBytes: (size) => randomBytes(size),
  };
  cached = { deps, tokenIssuer };
  return cached;
}
