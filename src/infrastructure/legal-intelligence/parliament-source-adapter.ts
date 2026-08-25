import {
  LegalIntelligenceAuthority,
  type LegalIntelligenceSourceRow,
} from "@/domain/legal-intelligence";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";

/**
 * Монгол Улсын Их Хурал — bills / discussion stages.
 * Not integrated yet: returns empty rather than fabricating records.
 */
export class ParliamentIntelligenceAdapter
  implements LegalIntelligenceSourceAdapter
{
  readonly id = "mn.parliament";
  readonly authority = LegalIntelligenceAuthority.PARLIAMENT;
  readonly displayName = "Монгол Улсын Их Хурал";
  readonly ready = false;

  async listRecords(_limit: number): Promise<LegalIntelligenceSourceRow[]> {
    return [];
  }

  async findById(_id: string): Promise<LegalIntelligenceSourceRow | null> {
    return null;
  }
}
