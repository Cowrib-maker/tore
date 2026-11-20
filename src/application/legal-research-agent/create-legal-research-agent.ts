import { LegalCorpusSource } from "@/application/ai/legal-corpus";
import { createRemoteCorpusRetriever } from "@/application/ai/create-legal-ai-service";
import { TieredLegalCorpusRetriever } from "@/application/ai/tiered-legal-corpus-retriever";
import { KnowledgeLegalCorpusRetriever } from "@/infrastructure/ai/knowledge-legal-corpus-retriever";
import { createReadOnlyKnowledgeRepository } from "@/infrastructure/ai/read-only-knowledge-repository";
import { legalGraphRepository } from "@/infrastructure/repositories";

import { LegalResearchAgent } from "./legal-research-agent";

let singleton: LegalResearchAgent | undefined;

/**
 * Composition root for the Legal Research Agent. Deliberately uses only the read-only tiers (local corpus, internal legal data engine):
 * the third production tier (live legalinfo.mn lookup) fetches over the network and writes a cache back into the corpus, which a
 * read-only agent must not do. No completion/model port is wired in this slice.
 */
export function getLegalResearchAgent(): LegalResearchAgent {
  singleton ??= new LegalResearchAgent({
    retriever: new TieredLegalCorpusRetriever([
      { retriever: new KnowledgeLegalCorpusRetriever(createReadOnlyKnowledgeRepository()), source: LegalCorpusSource.LOCAL_CORPUS },
      { retriever: createRemoteCorpusRetriever(), source: LegalCorpusSource.LEGAL_DATA_ENGINE },
    ]),
    graphRepository: legalGraphRepository,
  });
  return singleton;
}
