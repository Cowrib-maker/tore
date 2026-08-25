import {
  LegalIntelligenceAuthority,
  type LegalIntelligenceSourceRow,
} from "@/domain/legal-intelligence";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";

/**
 * Official court sources (shuukh / supreme court).
 * Not integrated yet: returns empty rather than fabricating records.
 */
export class CourtIntelligenceAdapter
  implements LegalIntelligenceSourceAdapter
{
  readonly id = "mn.court";
  readonly authority = LegalIntelligenceAuthority.COURT;
  readonly displayName = "Монгол Улсын шүүх";
  readonly ready = false;

  async listRecords(_limit: number): Promise<LegalIntelligenceSourceRow[]> {
    return [];
  }

  async findById(_id: string): Promise<LegalIntelligenceSourceRow | null> {
    return null;
  }
}
