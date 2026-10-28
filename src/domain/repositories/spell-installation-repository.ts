import type { SpellInstallation } from "@/domain/spell/entities";
import type { SpellPlatform } from "@/domain/spell/enums";

export type UpsertSpellInstallationInput = {
  keyThumbprint: string;
  publicKey: string;
  platform: SpellPlatform;
  appVersion: string;
  machineHintHash: string | null;
  now: Date;
};

export interface SpellInstallationRepository {
  findById(id: string): Promise<SpellInstallation | null>;
  findByThumbprint(keyThumbprint: string): Promise<SpellInstallation | null>;
  /** Creates the installation or refreshes its mutable fields. */
  upsert(input: UpsertSpellInstallationInput): Promise<SpellInstallation>;
  touch(id: string, now: Date): Promise<void>;
  revoke(id: string, at: Date): Promise<void>;
}
