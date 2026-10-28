import type { SpellLicenseEvent } from "@/domain/spell/entities";
import type { SpellActorType, SpellEventType } from "@/domain/spell/enums";

export type AppendSpellEventInput = {
  licenseId: string;
  activationId?: string | null;
  type: SpellEventType;
  actorType: SpellActorType;
  actorUserId?: string | null;
  ipHash?: string | null;
  /** Must never contain license codes, ciphertext, hashes or keys. */
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
};

/** Append-only. There is intentionally no update or delete. */
export interface SpellLicenseEventRepository {
  append(input: AppendSpellEventInput): Promise<SpellLicenseEvent>;
  listByLicenseId(licenseId: string, limit?: number): Promise<SpellLicenseEvent[]>;
}
