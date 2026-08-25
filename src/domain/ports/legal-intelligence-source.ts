import type {
  LegalIntelligenceAuthority,
  LegalIntelligenceSourceRow,
} from "@/domain/legal-intelligence";

/**
 * Authoritative source adapter for Legal Intelligence.
 * Adapters that are not yet integrated must return [] — never invent records.
 */
export interface LegalIntelligenceSourceAdapter {
  readonly id: string;
  readonly authority: LegalIntelligenceAuthority;
  readonly displayName: string;
  /** True when this adapter can fetch live records today. */
  readonly ready: boolean;
  listRecords(limit: number): Promise<LegalIntelligenceSourceRow[]>;
  findById(id: string): Promise<LegalIntelligenceSourceRow | null>;
}

export type LegalIntelligenceSourceRegistry = {
  adapters: readonly LegalIntelligenceSourceAdapter[];
};
