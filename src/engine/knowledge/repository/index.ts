export { InMemoryKnowledgeRepository } from "./repository.service";
export { ArchiveVerifiedKnowledgeRepository } from "./archive-verified-knowledge.repository";
export {
  documentMatchesDomain,
  domainFilterHints,
  extractArticleNumberFromText,
  filterDocumentsForSearch,
  isCitableOfficialDocumentType,
  isKnowledgeApplicableAt,
  isPositiveLawDocumentType,
  normalizeArticleNumber,
  rankDocumentsToHits,
  tokenizeSearchTerms,
} from "./article-search";
