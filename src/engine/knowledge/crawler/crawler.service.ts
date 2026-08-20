import {
  KnowledgeDocumentKind,
  type IKnowledgeCrawler,
  type KnowledgeCrawlJob,
  type RawKnowledgeDocument,
} from "../types";

/**
 * In-memory crawler for tests and local seeding.
 *
 * Production LegalInfo crawling uses {@link HttpKnowledgeCrawler}, injected
 * via {@link createKnowledgeEngine}. This class never performs HTTP.
 */
export class InMemoryKnowledgeCrawler implements IKnowledgeCrawler {
  constructor(private readonly documents: readonly RawKnowledgeDocument[] = []) {}

  /**
   * Returns a copy of configured documents, filtered by `job.urls` and
   * truncated by `job.maxDocuments`.
   */
  async crawl(job: KnowledgeCrawlJob): Promise<RawKnowledgeDocument[]> {
    const allowed = job.urls?.length
      ? this.documents.filter((document) => job.urls?.includes(document.sourceUrl))
      : [...this.documents];

    const limited =
      typeof job.maxDocuments === "number"
        ? allowed.slice(0, Math.max(0, job.maxDocuments))
        : allowed;

    return limited.map((document) => ({
      ...document,
      sourceId: job.sourceId,
      bytes: new Uint8Array(document.bytes),
    }));
  }
}

/**
 * Builds a seed {@link RawKnowledgeDocument} from UTF-8 text.
 * Helper for tests and fixtures — not an HTTP client.
 */
export function rawTextDocument(input: {
  sourceUrl: string;
  text: string;
  kind?: RawKnowledgeDocument["kind"];
  sourceId?: string;
  contentType?: string;
}): RawKnowledgeDocument {
  const kind = input.kind ?? KnowledgeDocumentKind.TEXT;
  return {
    sourceId: input.sourceId ?? "seed",
    sourceUrl: input.sourceUrl,
    kind,
    bytes: new TextEncoder().encode(input.text),
    contentType:
      input.contentType ??
      (kind === KnowledgeDocumentKind.HTML
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8"),
    fetchedAt: new Date(),
  };
}
