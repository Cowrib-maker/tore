import {
  buildLegalIntelligenceFeed,
  emptyLegalIntelligenceFeed,
  toLegalIntelligenceRecord,
  type LegalIntelligenceFeed,
  type LegalIntelligenceRecord,
} from "@/domain/legal-intelligence";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";

const SOURCE_SCAN_LIMIT = 40;

export async function loadLegalIntelligenceFeed(
  adapters: readonly LegalIntelligenceSourceAdapter[],
): Promise<LegalIntelligenceFeed> {
  try {
    const batches = await Promise.all(
      adapters.map(async (adapter) => {
        const rows = await adapter.listRecords(SOURCE_SCAN_LIMIT);
        return rows
          .map((row) => toLegalIntelligenceRecord(row, adapter.authority))
          .filter((row): row is LegalIntelligenceRecord => row !== null);
      }),
    );
    return buildLegalIntelligenceFeed(batches.flat());
  } catch (error) {
    console.error("[legal-intelligence] feed unavailable", error);
    return emptyLegalIntelligenceFeed();
  }
}

export async function getLegalIntelligenceRecord(
  id: string,
  adapters: readonly LegalIntelligenceSourceAdapter[],
): Promise<LegalIntelligenceRecord | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  for (const adapter of adapters) {
    const row = await adapter.findById(trimmed);
    if (!row) continue;
    return toLegalIntelligenceRecord(row, adapter.authority);
  }
  return null;
}
