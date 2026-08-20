/**
 * TORE Legal AI Knowledge Engine.
 *
 * Public surface for application adapters. Depend on {@link KnowledgeEngine}
 * and {@link createKnowledgeEngine} — do not assemble the pipeline in routes.
 */

import { ParagraphKnowledgeChunker } from "./chunker";
import { InMemoryKnowledgeCrawler } from "./crawler";
import { JsonKnowledgeExporter } from "./exporter";
import { RuleBasedKnowledgeMetadataExtractor } from "./metadata";
import { UnicodeKnowledgeNormalizer } from "./normalizer";
import { StructuralKnowledgeParser } from "./parser";
import { InMemoryKnowledgeRepository } from "./repository";
import { KnowledgeEngine } from "./services";
import type { KnowledgeEngineDependencies } from "./types";

export {
  KnowledgeDocumentKind,
} from "./types";
export {
  LegalCitationRole,
  LegalDocumentStatus,
  LegalIdentifierScheme,
  LegalNodeKind,
  LegalRelationType,
  LegalSourceKind,
} from "./schema";
export {
  CanonicalInstrumentKind,
  CanonicalUnitRole,
} from "./canonical";
export type {
  CanonicalOutlineUnit,
  CanonicalSourceDocument,
  ILegalParser,
  ISourceAdapter,
  SourceAdapterInput,
} from "./canonical";
export type {
  IKnowledgeChunker,
  IKnowledgeCrawler,
  IKnowledgeExporter,
  IKnowledgeMetadataExtractor,
  IKnowledgeNormalizer,
  IKnowledgeParser,
  IKnowledgeRepository,
  KnowledgeArticle,
  KnowledgeChunk,
  KnowledgeCrawlJob,
  KnowledgeEngineDependencies,
  KnowledgeExport,
  KnowledgeIngestionResult,
  KnowledgeMetadata,
  NormalizedKnowledgeDocument,
  ParsedKnowledgeDocument,
  RawKnowledgeDocument,
  StoredKnowledgeDocument,
  KnowledgeArchiveProvenance,
} from "./types";
export type {
  CommentaryAuthor,
  GovernmentRegulationBody,
  LawBody,
  LegalCitation,
  LegalCitationTarget,
  LegalCommentaryBody,
  LegalDocument,
  LegalDocumentIdentity,
  LegalDocumentRelation,
  LegalIdentifier,
  LegalLocator,
  LegalNode,
  LegalParty,
  LegalProvenance,
  LegalPublication,
  LegalSourceBody,
  LegalTemporal,
  LegalTextSpan,
  PartyRole,
  ProsecutorGuidelineBody,
  SupremeCourtDecisionBody,
} from "./schema";

export {
  HttpKnowledgeCrawler,
  InMemoryKnowledgeCrawler,
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
  rawTextDocument,
} from "./crawler";
export type {
  FetchLike,
  HttpKnowledgeCrawlerOptions,
  KnowledgeCrawlErrorCode,
} from "./crawler";
export {
  FileLegalInfoManifestStore,
  InMemoryLegalInfoManifestStore,
  LegalInfoDiscoverer,
  LegalInfoDocumentStatus,
  LegalInfoIngestionQueue,
  LegalInfoListClient,
  LEGALINFO_INGESTION_CONCURRENCY,
  LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
  LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
  LEGALINFO_MANIFEST_VERSION,
  createEmptyManifest,
  parseLegalInfoListHtml,
  planLegalInfoIngestionDryRun,
  plannedActionForStatus,
  selectQueue,
} from "./discovery";
export type {
  DryRunPlanItem,
  ILegalInfoManifestStore,
  LegalInfoDiscovererOptions,
  LegalInfoDiscoveryResult,
  LegalInfoIngestionDryRunPlan,
  LegalInfoIngestionQueueOptions,
  LegalInfoIngestionQueueResult,
  LegalInfoListClientOptions,
  LegalInfoListItem,
  LegalInfoListPage,
  LegalInfoManifest,
  LegalInfoManifestDocument,
  LegalInfoSourceType,
  PlannedIngestionAction,
} from "./discovery";
export {
  LegalInfoKnowledgeParser,
  LegalInfoLawParser,
  StructuralKnowledgeParser,
} from "./parser";
export type { LegalInfoLawParserOptions } from "./parser";
export { LegalInfoSourceAdapter } from "./adapters";
export { LawParser } from "./parsers";

export { UnicodeKnowledgeNormalizer } from "./normalizer";
export { RuleBasedKnowledgeMetadataExtractor } from "./metadata";
export { ParagraphKnowledgeChunker } from "./chunker";
export {
  ArchiveVerifiedKnowledgeRepository,
  InMemoryKnowledgeRepository,
} from "./repository";
export { JsonKnowledgeExporter } from "./exporter";
export {
  KnowledgeEngine,
  KnowledgeIngestionService,
  KnowledgeQueryService,
  knowledgeDocumentId,
} from "./services";

/**
 * Composition root for the default (in-memory) wiring.
 *
 * Default crawler remains {@link InMemoryKnowledgeCrawler} so tests and
 * local seeding stay offline. Inject {@link HttpKnowledgeCrawler} (or any
 * other {@link IKnowledgeCrawler}) through `overrides` for production LegalInfo
 * fetches without changing {@link KnowledgeEngine.ingest}.
 */
export function createKnowledgeEngine(
  overrides: Partial<KnowledgeEngineDependencies> = {},
): KnowledgeEngine {
  return new KnowledgeEngine({
    crawler: overrides.crawler ?? new InMemoryKnowledgeCrawler(),
    parser: overrides.parser ?? new StructuralKnowledgeParser(),
    normalizer: overrides.normalizer ?? new UnicodeKnowledgeNormalizer(),
    metadata:
      overrides.metadata ?? new RuleBasedKnowledgeMetadataExtractor(),
    chunker: overrides.chunker ?? new ParagraphKnowledgeChunker(),
    repository: overrides.repository ?? new InMemoryKnowledgeRepository(),
    exporter: overrides.exporter ?? new JsonKnowledgeExporter(),
  });
}
