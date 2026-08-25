import {
  classifyLegalIntelligence,
  emptyLegalIntelligenceFeed,
  type LegalIntelligenceFeed,
} from "@/domain/legal-intelligence";
import type { LegalIntelligenceRepository } from "@/domain/repositories/legal-intelligence-repository";

const SOURCE_SCAN_LIMIT = 40;

export async function loadLegalIntelligence(
  repository: LegalIntelligenceRepository,
): Promise<LegalIntelligenceFeed> {
  try {
    const rows = await repository.listPublicSummaries(SOURCE_SCAN_LIMIT);
    return classifyLegalIntelligence(rows);
  } catch (error) {
    console.error("[homepage] legal intelligence feed unavailable", error);
    return emptyLegalIntelligenceFeed();
  }
}
