/**
 * Best-effort persistence of a live-verified LegalInfo.mn document into the
 * same corpus tables the local retriever reads (`LegalKnowledgeDocument` /
 * `LegalKnowledgeArticle`), so a future identical citation is served
 * locally without another live fetch.
 *
 * Reuses the EXACT pipeline shape production batch ingestion already
 * proves out (`LegalInfoIngestionQueue.ingestOne` in
 * src/engine/knowledge/discovery/ingestion-queue.ts): archive the raw
 * bytes first, run them through the standard parse/normalize/metadata/
 * chunk pipeline via an in-memory KnowledgeEngine for validation, then
 * persist through the real repository with provenance taken from the
 * archive record — never invented, never a placeholder hash.
 *
 * "Best-effort": any failure here (archive unavailable, DB error, a
 * malformed document) is caught and swallowed. Caching is a side effect
 * of a successful live verification, never a precondition for answering
 * the student/lawyer's actual question — a cache failure must never turn
 * an otherwise-successful citation answer into an error.
 *
 * Repealed-article safety (post-audit fix): the shared
 * `LegalInfoKnowledgeParser` used for validation below strips `<s>`
 * (struck-through) markup before producing `KnowledgeArticle[]`, so a
 * repealed article elsewhere on the SAME page as the one just verified
 * would otherwise be cached as an ordinary, unflagged article — and the
 * local-corpus retrieval path has no repeal check of its own, unlike the
 * live web path (see legalinfo-article-extraction.ts). Before persisting,
 * this module independently re-scans the raw HTML for struck locators
 * (the exact same detection the live path uses) and drops any matching
 * article from what gets saved. The document and every non-repealed
 * article on the page are still cached normally — only struck locators
 * are excluded.
 */
import type { ArchiveService } from "@/engine/data/archive";
import {
  InMemoryKnowledgeCrawler,
  InMemoryKnowledgeRepository,
  JsonKnowledgeExporter,
  KnowledgeDocumentKind,
  KnowledgeEngine,
  LegalInfoKnowledgeParser,
  ParagraphKnowledgeChunker,
  RuleBasedKnowledgeMetadataExtractor,
  UnicodeKnowledgeNormalizer,
} from "@/engine/knowledge";
import type { IKnowledgeRepository, RawKnowledgeDocument } from "@/engine/knowledge/types";
import { collectStruckLocators, isArticleNumberStruck } from "./legalinfo-article-extraction";

export type CacheVerifiedWebDocumentInput = {
  html: string;
  sourceUrl: string;
  lawId: string;
  archive: ArchiveService;
  /** The real, write-capable repository — never the read-only chat wrapper. */
  repository: IKnowledgeRepository;
};

export type CacheVerifiedWebDocumentResult =
  | { cached: true; archiveId: string; contentSha256: string }
  | { cached: false };

/** Never throws — a cache failure degrades to `{cached: false}`, not an error. */
export async function cacheVerifiedWebDocument(
  input: CacheVerifiedWebDocumentInput,
): Promise<CacheVerifiedWebDocumentResult> {
  try {
    const bytes = new TextEncoder().encode(input.html);
    const archiveResult = await input.archive.store({
      bytes,
      connectorId: "mn.legalinfo",
      source: "legalinfo.mn",
      sourceId: "legalinfo-live",
      lawId: input.lawId,
      jurisdiction: "MN",
      authority: "LEGALINFO",
      sourceType: "law",
      originalUrl: input.sourceUrl,
      originalFileName: "legalinfo-detail.html",
      mimeType: "text/html",
      encoding: "utf-8",
      fetchedAt: new Date().toISOString(),
    });

    const archiveRecord = archiveResult.record;
    await input.archive.verifyArchiveIntegrity(archiveRecord.sha256);

    const raw: RawKnowledgeDocument = {
      sourceId: "legalinfo",
      sourceUrl: input.sourceUrl,
      kind: KnowledgeDocumentKind.HTML,
      bytes,
      contentType: "text/html",
      fetchedAt: new Date(),
    };

    // Validate through an in-memory engine first — mirrors the batch
    // ingestion queue's own guard against persisting an empty/broken parse.
    const validationEngine = new KnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([raw]),
      parser: new LegalInfoKnowledgeParser(),
      normalizer: new UnicodeKnowledgeNormalizer(),
      metadata: new RuleBasedKnowledgeMetadataExtractor(),
      chunker: new ParagraphKnowledgeChunker(),
      repository: new InMemoryKnowledgeRepository(),
      exporter: new JsonKnowledgeExporter(),
    });
    const validation = await validationEngine.ingest({
      sourceId: "legalinfo",
      urls: [input.sourceUrl],
      maxDocuments: 1,
    });
    const stored = validation.ingested[0];
    if (!stored || stored.articles.length === 0 || stored.chunks.length === 0) {
      return { cached: false };
    }

    // Drop any struck-through (repealed) article before it ever reaches
    // the repository — never cache a repealed provision as a normal,
    // valid article. The emptiness guard above already ran against the
    // unfiltered parse, so it still genuinely proves the parser worked;
    // filtering here only removes provisions this module has independent
    // raw-HTML evidence are repealed.
    const struckLocators = collectStruckLocators(input.html);
    const articles = stored.articles.filter(
      (article) =>
        !article.articleNumber || !isArticleNumberStruck(article.articleNumber, struckLocators),
    );

    await input.repository.save({
      ...stored,
      articles,
      provenance: {
        archiveId: archiveRecord.archiveId,
        sha256: archiveRecord.sha256,
        contentSha256: archiveRecord.contentSha256,
        originalUrl: archiveRecord.originalUrl,
        lawId: input.lawId,
      },
    });
    return {
      cached: true,
      archiveId: archiveRecord.archiveId,
      contentSha256: archiveRecord.contentSha256,
    };
  } catch {
    return { cached: false };
  }
}
