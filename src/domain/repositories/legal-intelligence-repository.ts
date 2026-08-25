import type { LegalIntelligenceSourceRow } from "@/domain/legal-intelligence";

export interface LegalIntelligenceRepository {
  listPublicSummaries(limit: number): Promise<LegalIntelligenceSourceRow[]>;
}
