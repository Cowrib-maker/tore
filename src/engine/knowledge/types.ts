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
  /** Stable id when persisted (Prisma cuid or `${documentId}:article:${order}`). */
  id?: string;
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
  /**
   * ISO date from the source catalog (LegalInfo `enforcementdate`).
   * Null when the source did not publish a date — never invented.
   */
  validFrom?: string | null;
  /** ISO date from the source catalog when known; null if missing. */
  validTo?: string | null;
  /**
   * Authoritative publisher version label only.
   * Null when the source has none — never a local `vN` ingest counter.
   */
  sourceVersion?: string | null;
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
  /** ISO date — when known from source catalog; null if unknown. */
  validFrom?: string | null;
  /** ISO date — exclusive end when known; null = still in force / unknown. */
  validTo?: string | null;
  /** Source / archive version label when known. */
  sourceVersion?: string | null;
  /**
   * Explicit publisher/catalog force status when the source supplied one.
   * Never inferred from isactive, recodification subtitles, or latest scrape.
   * Not a Prisma column — in-memory / caller-supplied only in v0.2.
   */
  sourceStatus?: "IN_FORCE" | "EXPIRED" | "REPEALED" | null;
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
  /** Monotonic version per sourceUrl when persisted via Prisma. */
  version?: number;
  /**
   * Link to the immutable archive snapshot. Required for durable PostgreSQL
   * persistence; optional for in-memory / offline verification scripts.
   */
  provenance?: KnowledgeArchiveProvenance;
};

/**
 * Deterministic article-level search for positive-law rule retrieval.
 * Repository implementations must filter in-store — not load the full corpus.
 */
export type KnowledgeArticleSearchQuery = {
  /** Free-text / legal concept / issue statement. */
  text?: string;
  /** Exact or normalized article number (e.g. "15", "Зүйл 15"). */
  articleNumber?: string | null;
  /** Paragraph inside an article when the source stores paragraphs inline. */
  paragraphNumber?: string | null;
  /** Canonical source law id; preferred for exact citation retrieval. */
  lawId?: string | null;
  /** SQL title constraints used by deterministic exact-citation lookup. */
  titleTerms?: string[];
  excludeTitleTerms?: string[];
  /** CRIMINAL | CIVIL | ADMINISTRATIVE — filters via document metadata/title. */
  domain?: string | null;
  issueKind?: string | null;
  jurisdiction?: string | null;
  sourceUrl?: string | null;
  sourceId?: string | null;
  documentType?: string | null;
  /** When set, callers should discard hits outside validity; repo may pre-filter. */
  applicableAt?: string | null;
  /**
   * `statute` (default): laws/constitution only — used by doctrine mapping.
   * `all`: laws, resolutions, orders, and official court acts. Never commentary/AI.
   */
  officialSourceKinds?: "statute" | "all";
  limit?: number;
};

export const KnowledgeMatchKind = {
  ARTICLE_NUMBER: "ARTICLE_NUMBER",
  CONCEPT: "CONCEPT",
  ISSUE_KIND: "ISSUE_KIND",
  TITLE: "TITLE",
  CHUNK: "CHUNK",
} as const;

export type KnowledgeMatchKind =
  (typeof KnowledgeMatchKind)[keyof typeof KnowledgeMatchKind];

/**
 * Smallest useful positive-law unit returned by {@link IKnowledgeRepository.searchArticles}.
 */
export type KnowledgeArticleHit = {
  documentId: string;
  sourceId: string;
  sourceUrl: string;
  officialUrl: string;
  documentTitle: string;
  documentType: string | null;
  jurisdiction: string;
  lawId: string | null;
  contentSha256: string | null;
  version: number | null;
  articleId: string;
  articleNumber: string | null;
  articleTitle: string | null;
  articleText: string;
  chunkId: string | null;
  chunkText: string | null;
  matchKind: KnowledgeMatchKind;
  score: number;
  validFrom: string | null;
  validTo: string | null;
  sourceVersion: string | null;
};

/**
 * Provenance: legal document → archive snapshot → official source URL.
 */
export type KnowledgeArchiveProvenance = {
  archiveId: string;
  /** SHA-256 of the stored archive blob (raw HTTP bytes). */
  sha256: string;
  /** SHA-256 of canonical legal source bytes when known. */
  contentSha256?: string;
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
  /**
   * Every stored snapshot for an official URL.
   * Ordered by ingest time then id — storage metadata only, not legal force.
   */
  listBySourceUrl(sourceUrl: string): Promise<StoredKnowledgeDocument[]>;
  list(): Promise<StoredKnowledgeDocument[]>;
  /**
   * Article-level search for rule retrieval. Must not invent content.
   * Prisma path filters in SQL; in-memory path scans its local map only.
   */
  searchArticles(
    query: KnowledgeArticleSearchQuery,
  ): Promise<KnowledgeArticleHit[]>;
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
