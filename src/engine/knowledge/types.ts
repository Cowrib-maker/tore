/**
 * Contracts for the TORE Legal AI Knowledge Engine.
 *
 * Stable boundary for ingestion: crawl → parse → normalize → metadata →
 * chunk → persist → export. Swap any port without changing
 * {@link KnowledgeIngestionService}. This module does not call models
 * and does not create embeddings.
 *
 * Canonical legal meaning (hierarchy + citations) lives in `./schema`.
 * Types in this file are pipeline mechanics, not the legal source model.
 */

/** Original bytes as fetched from an official source. */
export const KnowledgeDocumentKind = {
  HTML: "html",
  PDF: "pdf",
  TEXT: "text",
} as const;

export type KnowledgeDocumentKind =
  (typeof KnowledgeDocumentKind)[keyof typeof KnowledgeDocumentKind];

/** One crawl/ingest request. Adapters must not put this logic in routes. */
export type KnowledgeCrawlJob = {
  sourceId: string;
  /** Optional allow-list. When omitted, the crawler uses its configured sources. */
  urls?: string[];
  maxDocuments?: number;
};

/** Immutable snapshot of fetched source bytes. */
export type RawKnowledgeDocument = {
  sourceId: string;
  sourceUrl: string;
  kind: KnowledgeDocumentKind;
  bytes: Uint8Array;
  contentType?: string;
  fetchedAt: Date;
};

/** One structural unit of a legal text. Not a RAG embedding. */
export type KnowledgeArticle = {
  articleNumber: string | null;
  title: string | null;
  text: string;
  order: number;
};

/** Parser output before normalization. */
export type ParsedKnowledgeDocument = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  kind: KnowledgeDocumentKind;
  articles: KnowledgeArticle[];
};

/** Parser output after Unicode/whitespace normalization. */
export type NormalizedKnowledgeDocument = ParsedKnowledgeDocument & {
  normalizedTitle: string;
};

/** Source-level descriptive fields. Expand later without changing ports. */
export type KnowledgeMetadata = {
  title: string;
  language: string;
  jurisdiction: string;
  documentType: string | null;
  sourceUrl: string;
  articleCount: number;
};

/** Retrieval-sized slice of an article. No vector is attached here. */
export type KnowledgeChunk = {
  id: string;
  documentId: string;
  articleNumber: string | null;
  order: number;
  text: string;
  tokenEstimate: number;
};

/** Persisted knowledge record. */
export type StoredKnowledgeDocument = {
  id: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  kind: KnowledgeDocumentKind;
  metadata: KnowledgeMetadata;
  articles: KnowledgeArticle[];
  chunks: KnowledgeChunk[];
  ingestedAt: Date;
  /**
   * Link to the immutable archive snapshot. Required for durable PostgreSQL
   * persistence; optional for in-memory / offline verification scripts.
   */
  provenance?: KnowledgeArchiveProvenance;
};

/**
 * Provenance: legal document → archive snapshot → official source URL.
 */
export type KnowledgeArchiveProvenance = {
  archiveId: string;
  sha256: string;
  originalUrl: string;
  lawId?: string | null;
};

/** Portable snapshot produced by {@link IKnowledgeExporter}. */
export type KnowledgeExport = {
  version: 1;
  exportedAt: string;
  documentCount: number;
  documents: StoredKnowledgeDocument[];
};

/** Result of one ingestion run. */
export type KnowledgeIngestionResult = {
  sourceId: string;
  ingested: StoredKnowledgeDocument[];
  failed: Array<{ sourceUrl: string; reason: string }>;
};

/**
 * Port: fetch official source documents.
 * Production: {@link HttpKnowledgeCrawler}. Tests/seed: {@link InMemoryKnowledgeCrawler}.
 */
export interface IKnowledgeCrawler {
  crawl(job: KnowledgeCrawlJob): Promise<RawKnowledgeDocument[]>;
}

/** Port: turn original bytes into articles. Replace with a LegalInfo article parser. */
export interface IKnowledgeParser {
  parse(raw: RawKnowledgeDocument): Promise<ParsedKnowledgeDocument>;
}

/** Port: canonicalize text without changing legal meaning. */
export interface IKnowledgeNormalizer {
  normalize(document: ParsedKnowledgeDocument): NormalizedKnowledgeDocument;
}

/** Port: derive language/jurisdiction/title from normalized text. */
export interface IKnowledgeMetadataExtractor {
  extract(document: NormalizedKnowledgeDocument): KnowledgeMetadata;
}

/** Port: split articles into retrieval chunks. Does not embed. */
export interface IKnowledgeChunker {
  chunk(
    document: NormalizedKnowledgeDocument,
    documentId: string,
  ): KnowledgeChunk[];
}

/** Port: persist knowledge records. Replace with a Prisma/SQL adapter later. */
export interface IKnowledgeRepository {
  save(document: StoredKnowledgeDocument): Promise<StoredKnowledgeDocument>;
  findById(id: string): Promise<StoredKnowledgeDocument | null>;
  findBySourceUrl(sourceUrl: string): Promise<StoredKnowledgeDocument | null>;
  list(): Promise<StoredKnowledgeDocument[]>;
}

/** Port: serialize the knowledge base for backup or downstream pipelines. */
export interface IKnowledgeExporter {
  exportAll(documents: StoredKnowledgeDocument[]): KnowledgeExport;
}

/** Injected collaborators for the ingestion orchestrator. */
export type KnowledgeEngineDependencies = {
  crawler: IKnowledgeCrawler;
  parser: IKnowledgeParser;
  normalizer: IKnowledgeNormalizer;
  metadata: IKnowledgeMetadataExtractor;
  chunker: IKnowledgeChunker;
  repository: IKnowledgeRepository;
  exporter: IKnowledgeExporter;
};
