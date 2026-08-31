import {
  LegalIntelligenceAuthority,
  type LegalIntelligenceSourceRow,
} from "@/domain/legal-intelligence";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";
import type { LegalIntelligenceRepository } from "@/domain/repositories/legal-intelligence-repository";

/**
 * Монгол Улсын Их Хурал — ingested official parliament.mn URLs only.
 */
export class ParliamentIntelligenceAdapter
  implements LegalIntelligenceSourceAdapter
{
  readonly id = "mn.parliament";
  readonly authority = LegalIntelligenceAuthority.PARLIAMENT;
  readonly displayName = "Монгол Улсын Их Хурал";
  readonly ready = true;

  constructor(private readonly repository: LegalIntelligenceRepository) {}

  listRecords(limit: number): Promise<LegalIntelligenceSourceRow[]> {
    return this.repository.listPublicSummariesByHost("parliament.mn", limit);
  }

  findById(id: string): Promise<LegalIntelligenceSourceRow | null> {
    return this.repository.findById(id);
  }
}
