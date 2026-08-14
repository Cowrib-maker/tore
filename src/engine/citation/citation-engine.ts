import type { LegalDocument } from "../knowledge/schema";
import { buildCitationIndex } from "./build-index";
import { CitationResolver } from "./citation-resolver";
import { grammarForDocument } from "./grammars";
import type { CitationGrammar, CitationIndex } from "./types";

/**
 * Deterministic citation engine.
 * No models, embeddings, or network I/O.
 */
export class CitationEngine {
  buildIndex(
    document: LegalDocument,
    grammar?: CitationGrammar,
  ): CitationIndex {
    return buildCitationIndex(
      document,
      grammar ?? grammarForDocument(document),
    );
  }

  resolver(
    document: LegalDocument,
    grammar?: CitationGrammar,
  ): CitationResolver {
    return CitationResolver.fromDocument(document, grammar);
  }
}

export function createCitationEngine(): CitationEngine {
  return new CitationEngine();
}
