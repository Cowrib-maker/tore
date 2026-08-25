import { LegalInfoIntelligenceAdapter } from "@/infrastructure/legal-intelligence/legalinfo-source-adapter";
import { ParliamentIntelligenceAdapter } from "@/infrastructure/legal-intelligence/parliament-source-adapter";
import { CourtIntelligenceAdapter } from "@/infrastructure/legal-intelligence/court-source-adapter";
import type { LegalIntelligenceSourceAdapter } from "@/domain/ports/legal-intelligence-source";
import { legalIntelligenceRepository } from "@/infrastructure/repositories/prisma-legal-intelligence-repository";

/**
 * Authoritative source registry for Legal Intelligence.
 * Only LegalInfo is ready; parliament/court adapters are stubs that return [].
 */
export function createLegalIntelligenceAdapters(): LegalIntelligenceSourceAdapter[] {
  return [
    new LegalInfoIntelligenceAdapter(legalIntelligenceRepository),
    new ParliamentIntelligenceAdapter(),
    new CourtIntelligenceAdapter(),
  ];
}

export const legalIntelligenceAdapters = createLegalIntelligenceAdapters();
