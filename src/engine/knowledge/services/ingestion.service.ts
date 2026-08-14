import { createHash } from "node:crypto";

import type {
  IKnowledgeChunker,
  IKnowledgeCrawler,
  IKnowledgeExporter,
  IKnowledgeMetadataExtractor,
  IKnowledgeNormalizer,
  IKnowledgeParser,
  IKnowledgeRepository,
  KnowledgeCrawlJob,
  KnowledgeEngineDependencies,
  KnowledgeExport,
  KnowledgeIngestionResult,
  StoredKnowledgeDocument,
} from "../types";

/**
 * Orchestrates crawl → parse → normalize → metadata → chunk → save.
 *
 * Routes must not contain this pipeline. Inject {@link KnowledgeIngestionService}
 * (or {@link KnowledgeEngine}) from an application adapter.
 */
export class KnowledgeIngestionService {
  private readonly crawler: IKnowledgeCrawler;
  private readonly parser: IKnowledgeParser;
  private readonly normalizer: IKnowledgeNormalizer;
  private readonly metadata: IKnowledgeMetadataExtractor;
  private readonly chunker: IKnowledgeChunker;
  private readonly repository: IKnowledgeRepository;

  constructor(dependencies: KnowledgeEngineDependencies) {
    this.crawler = dependencies.crawler;
    this.parser = dependencies.parser;
    this.normalizer = dependencies.normalizer;
    this.metadata = dependencies.metadata;
    this.chunker = dependencies.chunker;
    this.repository = dependencies.repository;
  }

  /**
   * Ingests at most `job.maxDocuments` sources. Failures are recorded
   * per URL and do not abort the rest of the job.
   */
  async ingest(job: KnowledgeCrawlJob): Promise<KnowledgeIngestionResult> {
    const rawDocuments = await this.crawler.crawl(job);
    const ingested: StoredKnowledgeDocument[] = [];
    const failed: KnowledgeIngestionResult["failed"] = [];

    for (const raw of rawDocuments) {
      try {
        const parsed = await this.parser.parse(raw);
        const normalized = this.normalizer.normalize(parsed);
        const metadata = this.metadata.extract(normalized);
        const id = knowledgeDocumentId(raw.sourceUrl);
        const chunks = this.chunker.chunk(normalized, id);
        const stored = await this.repository.save({
          id,
          sourceId: job.sourceId,
          sourceUrl: raw.sourceUrl,
          title: normalized.normalizedTitle,
          kind: raw.kind,
          metadata,
          articles: normalized.articles,
          chunks,
          ingestedAt: new Date(),
        });
        ingested.push(stored);
      } catch (error) {
        failed.push({
          sourceUrl: raw.sourceUrl,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { sourceId: job.sourceId, ingested, failed };
  }
}

/**
 * Read/export facade over {@link IKnowledgeRepository} and
 * {@link IKnowledgeExporter}.
 */
export class KnowledgeQueryService {
  constructor(
    private readonly repository: IKnowledgeRepository,
    private readonly exporter: IKnowledgeExporter,
  ) {}

  /** Returns one stored document or `null`. */
  async getById(id: string): Promise<StoredKnowledgeDocument | null> {
    return this.repository.findById(id);
  }

  /** Returns every stored document. */
  async list(): Promise<StoredKnowledgeDocument[]> {
    return this.repository.list();
  }

  /** Builds a JSON snapshot of the current knowledge base. */
  async exportSnapshot(): Promise<KnowledgeExport> {
    const documents = await this.repository.list();
    return this.exporter.exportAll(documents);
  }
}

/**
 * Composition facade for adapters. Prefer this over reaching into
 * individual pipeline stages from HTTP handlers.
 */
export class KnowledgeEngine {
  readonly ingestion: KnowledgeIngestionService;
  readonly query: KnowledgeQueryService;

  constructor(dependencies: KnowledgeEngineDependencies) {
    this.ingestion = new KnowledgeIngestionService(dependencies);
    this.query = new KnowledgeQueryService(
      dependencies.repository,
      dependencies.exporter,
    );
  }

  /** @see KnowledgeIngestionService.ingest */
  ingest(job: KnowledgeCrawlJob): Promise<KnowledgeIngestionResult> {
    return this.ingestion.ingest(job);
  }

  /** @see KnowledgeQueryService.getById */
  getById(id: string): Promise<StoredKnowledgeDocument | null> {
    return this.query.getById(id);
  }

  /** @see KnowledgeQueryService.exportSnapshot */
  exportSnapshot(): Promise<KnowledgeExport> {
    return this.query.exportSnapshot();
  }
}

/** Stable content-addressed id derived from the official source URL. */
export function knowledgeDocumentId(sourceUrl: string): string {
  return createHash("sha256").update(sourceUrl).digest("hex").slice(0, 32);
}
