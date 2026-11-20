import type { SpellActivation } from "@/domain/spell/entities";
import type {
  SpellActivationEndReason,
  SpellActivationStatus,
} from "@/domain/spell/enums";

export type CreateSpellActivationInput = {
  licenseId: string;
  installationId: string;
  userId: string | null;
  activatedAt: Date;
  transferredFromActivationId: string | null;
  lastTokenJti: string | null;
};

export type EndSpellActivationInput = {
  id: string;
  status: Exclude<SpellActivationStatus, "ACTIVE">;
  reason: SpellActivationEndReason;
  at: Date;
  supersededByActivationId?: string | null;
};

export interface SpellActivationRepository {
  findById(id: string): Promise<SpellActivation | null>;
  findActiveByLicenseId(licenseId: string): Promise<SpellActivation | null>;
  /** Most recent activation of any status (by activatedAt, then createdAt). */
  findLatestByLicenseId(licenseId: string): Promise<SpellActivation | null>;
  listByLicenseId(licenseId: string): Promise<SpellActivation[]>;
  listActiveByInstallationId(installationId: string): Promise<SpellActivation[]>;
  /**
   * Insert an ACTIVE activation. The database enforces at most one ACTIVE row
   * per license; a violation surfaces as `SpellActiveActivationConflictError`.
   */
  create(input: CreateSpellActivationInput): Promise<SpellActivation>;
  /** Only transitions an ACTIVE row; returns false if it was not ACTIVE. */
  end(input: EndSpellActivationInput): Promise<boolean>;
  recordValidation(id: string, at: Date, tokenJti: string): Promise<void>;
  setSuperseded(id: string, supersededByActivationId: string): Promise<void>;
}

export class SpellActiveActivationConflictError extends Error {
  constructor() {
    super("A license can have only one ACTIVE activation");
    this.name = "SpellActiveActivationConflictError";
  }
}
