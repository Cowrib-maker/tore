import { LegalInfoIntelligenceAdapter } from "@/infrastructure/legal-intelligence/legalinfo-source-adapter";
import { ParliamentIntelligenceAdapter } from "@/infrastructure/legal-intelligence/parliament-source-adapter";
import { CourtIntelligenceAdapter } from "@/infrastructure/legal-intelligence/court-source-adapter";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";
import { legalIntelligenceRepository } from "@/infrastructure/repositories/prisma-legal-intelligence-repository";

/**
 * Authoritative source registry for Legal Intelligence.
 * Adapters return ingested official records only; empty means none ingested yet.
 */
export function createLegalIntelligenceAdapters(): LegalIntelligenceSourceAdapter[] {
  return [
    new LegalInfoIntelligenceAdapter(legalIntelligenceRepository),
    new ParliamentIntelligenceAdapter(legalIntelligenceRepository),
    new CourtIntelligenceAdapter(legalIntelligenceRepository),
  ];
}

export const legalIntelligenceAdapters = createLegalIntelligenceAdapters();
