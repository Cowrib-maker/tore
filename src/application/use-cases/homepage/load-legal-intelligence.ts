import { loadLegalIntelligenceFeed } from "@/application/use-cases/legal-intelligence/load-feed";
import type { LegalIntelligenceFeed } from "@/domain/legal-intelligence";
import { legalIntelligenceAdapters } from "@/infrastructure/legal-intelligence";

/** Homepage entry — aggregates ready + stub adapters. */
export async function loadLegalIntelligence(): Promise<LegalIntelligenceFeed> {
  return loadLegalIntelligenceFeed(legalIntelligenceAdapters);
}
