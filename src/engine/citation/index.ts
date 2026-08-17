/**
 * TORE Citation Engine.
 *
 * Builds a searchable citation index from a LegalDocument.
 * Does not crawl, parse, call models, or create embeddings.
 */

export type {
  CanonicalPinpoint,
  CitationEntry,
  CitationFormatInput,
  CitationGrammar,
  CitationIndex,
} from "./types";

export { buildCitationIndex } from "./build-index";
export { CitationResolver } from "./citation-resolver";
export { CitationEngine, createCitationEngine } from "./citation-engine";
export {
  genericCitationGrammar,
  grammarForDocument,
  mnStatuteGrammar,
} from "./grammars";
export { normalizeCitation } from "./normalize";
export {
  dottedPinpoint,
  parseDottedPinpoint,
  pinpointKey,
} from "./pinpoint";
export {
  detectExactCitation,
} from "./parse-exact-citation-query";
export type { DetectedExactCitation } from "./parse-exact-citation-query";
