import { LegalIntelligenceAuthority } from "@/domain/legal-intelligence";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";
import type { LegalIntelligenceRepository } from "@/domain/repositories/legal-intelligence-repository";

/**
 * LegalInfo / legal knowledge corpus adapter.
 * Reuses existing legal_knowledge_documents — does not invent records.
 */
export class LegalInfoIntelligenceAdapter
  implements LegalIntelligenceSourceAdapter
{
  readonly id = "mn.legalinfo";
  readonly authority = LegalIntelligenceAuthority.LEGALINFO;
  readonly displayName = "Хууль зүйн мэдээллийн нэгдсэн систем";
  readonly ready = true;

  constructor(private readonly repository: LegalIntelligenceRepository) {}

  listRecords(limit: number) {
    return this.repository.listPublicSummaries(limit);
  }

  findById(id: string) {
    return this.repository.findById(id);
  }
}
