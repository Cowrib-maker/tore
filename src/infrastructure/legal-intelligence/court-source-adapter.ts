import {
  LegalIntelligenceAuthority,
  type LegalIntelligenceSourceRow,
} from "@/domain/legal-intelligence";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";
import type { LegalIntelligenceRepository } from "@/domain/repositories/legal-intelligence-repository";

/**
 * Official court sources (shuukh.mn). Returns ingested official URLs only —
 * never fabricates judgments.
 */
export class CourtIntelligenceAdapter
  implements LegalIntelligenceSourceAdapter
{
  readonly id = "mn.court";
  readonly authority = LegalIntelligenceAuthority.COURT;
  readonly displayName = "Монгол Улсын шүүх";
  readonly ready = true;

  constructor(private readonly repository: LegalIntelligenceRepository) {}

  listRecords(limit: number): Promise<LegalIntelligenceSourceRow[]> {
    return this.repository.listPublicSummariesByHost("shuukh.mn", limit);
  }

  findById(id: string): Promise<LegalIntelligenceSourceRow | null> {
    return this.repository.findById(id);
  }
}
