export {
  InMemoryKnowledgeCrawler,
  rawTextDocument,
} from "./crawler.service";
export {
  HttpKnowledgeCrawler,
  type FetchLike,
  type HttpKnowledgeCrawlerOptions,
} from "./http-knowledge-crawler";
export {
  KnowledgeCrawlError,
  LEGALINFO_CONSTITUTION_CATEGORY_ID,
  LEGALINFO_CONSTITUTION_LAW_ID,
  LEGALINFO_DEFAULT_LOCALE,
  LEGALINFO_HOST,
  LEGALINFO_STATUTE_CATEGORY_ID,
  LEGALINFO_VERIFY_LAW_IDS,
  LEGALINFO_VERIFY_50_LAW_IDS,
  assertHttpsLegalInfoUrl,
  isLegalInfoHostname,
  legalInfoAjaxListUrl,
  legalInfoCategoryUrl,
  legalInfoDetailUrl,
  lawIdFromLegalInfoUrl,
  type KnowledgeCrawlErrorCode,
} from "./legalinfo-url";
