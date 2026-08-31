export { InMemoryKnowledgeRepository } from "./repository.service";
export { ArchiveVerifiedKnowledgeRepository } from "./archive-verified-knowledge.repository";
export {
  documentMatchesDomain,
  domainFilterHints,
  extractArticleNumberFromText,
  filterDocumentsForSearch,
  inferLegalDomainFromText,
  isCitableOfficialDocumentType,
  isKnowledgeApplicableAt,
  isPositiveLawDocumentType,
  MIN_OPEN_QUESTION_CITATION_SCORE,
  normalizeArticleNumber,
  rankDocumentsToHits,
  stripLegalHtmlTags,
  tokenizeSearchTerms,
} from "./article-search";
