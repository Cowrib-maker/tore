import type { SpellLicense } from "@/domain/spell/entities";
import type { SpellLicenseSource, SpellLicenseStatus, SpellPlanCode } from "@/domain/spell/enums";

export type CreateSpellLicenseInput = Omit<
  SpellLicense,
  | "status"
  | "startsAt"
  | "expiresAt"
  | "lastDeviceChangeAt"
  | "revokedAt"
  | "revokedReason"
  | "createdAt"
  | "updatedAt"
>;

export type ListSpellLicensesInput = {
  status?: SpellLicenseStatus;
  planCode?: SpellPlanCode;
  source?: SpellLicenseSource;
  ownerUserId?: string;
  limit: number;
  offset: number;
};

export interface SpellLicenseRepository {
  create(input: CreateSpellLicenseInput): Promise<SpellLicense>;
  findById(id: string): Promise<SpellLicense | null>;
  /** The licence minted for this invoice, if any (idempotent fulfilment). */
  findByPurchaseInvoiceId(invoiceId: string): Promise<SpellLicense | null>;
  /** Hashes under every configured HMAC key (supports key rotation). */
  findByCodeHashes(hashes: string[]): Promise<SpellLicense | null>;
  listByOwner(ownerUserId: string): Promise<SpellLicense[]>;
  list(input: ListSpellLicensesInput): Promise<{ items: SpellLicense[]; total: number }>;
  /** Starts the term clock. Returns false if it was already started. */
  startTerm(id: string, startsAt: Date, expiresAt: Date): Promise<boolean>;
  setLastDeviceChangeAt(id: string, at: Date | null): Promise<void>;
  /** Returns false if the license was already revoked. */
  revoke(id: string, at: Date, reason: string): Promise<boolean>;
  updateCodeCiphertext(
    id: string,
    ciphertext: Uint8Array,
    keyVersion: string,
  ): Promise<void>;
}
