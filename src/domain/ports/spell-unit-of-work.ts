import type { SpellActivationRepository } from "@/domain/repositories/spell-activation-repository";
import type { SpellLicenseEventRepository } from "@/domain/repositories/spell-event-repository";
import type { SpellInstallationRepository } from "@/domain/repositories/spell-installation-repository";
import type { SpellLicenseRepository } from "@/domain/repositories/spell-license-repository";

export type SpellRepositories = {
  licenseRepository: SpellLicenseRepository;
  installationRepository: SpellInstallationRepository;
  activationRepository: SpellActivationRepository;
  eventRepository: SpellLicenseEventRepository;
};

/**
 * Atomic unit of work for every Spell state change. Implementations run at
 * SERIALIZABLE isolation and retry serialization failures a bounded number of
 * times, so `work` MUST be safe to re-run (no external side effects inside).
 */
export interface SpellUnitOfWork {
  runInTransaction<T>(work: (repos: SpellRepositories) => Promise<T>): Promise<T>;
}
