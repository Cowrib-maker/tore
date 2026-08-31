import {
  LEGALINFO_CONSTITUTION_CATEGORY_ID,
  LEGALINFO_STATUTE_CATEGORY_ID,
} from "../crawler/legalinfo-url";
import { sourceTypeForLegalInfoCategory } from "../crawler/legalinfo-categories";
import type { FetchLike } from "../crawler/http-knowledge-crawler";
import {
  LegalInfoListClient,
  type LegalInfoListItem,
} from "./legalinfo-list-client";
import {
  LegalInfoDocumentStatus,
  type LegalInfoManifest,
  type LegalInfoManifestDocument,
  type LegalInfoSourceType,
} from "./types";
import { createEmptyManifest } from "./manifest-store";

export type LegalInfoDiscovererOptions = {
  fetchImpl?: FetchLike;
  listClient?: LegalInfoListClient;
  /** Category ids to crawl. Defaults to constitution + statutes. */
  categoryIds?: readonly string[];
  /** Delay between list page requests (ms). Default 250. */
  requestDelayMs?: number;
  /** Optional hard cap on pages per category (tests). */
  maxPagesPerCategory?: number;
  /** Clock override for tests. */
  now?: () => Date;
};

export type LegalInfoDiscoveryResult = {
  manifest: LegalInfoManifest;
  discoveredCount: number;
  pagesFetched: number;
};

/**
 * Discovers LegalInfo detail URLs from official category list pages.
 * Does not download law detail HTML and does not hardcode the corpus.
 */
export class LegalInfoDiscoverer {
  private readonly listClient: LegalInfoListClient;
  private readonly categoryIds: readonly string[];
  private readonly requestDelayMs: number;
  private readonly maxPagesPerCategory: number | undefined;
  private readonly now: () => Date;

  constructor(options: LegalInfoDiscovererOptions = {}) {
    this.listClient =
      options.listClient ??
      new LegalInfoListClient({ fetchImpl: options.fetchImpl });
    this.categoryIds = options.categoryIds ?? [
      LEGALINFO_CONSTITUTION_CATEGORY_ID,
      LEGALINFO_STATUTE_CATEGORY_ID,
    ];
    this.requestDelayMs = Math.max(0, options.requestDelayMs ?? 250);
    this.maxPagesPerCategory = options.maxPagesPerCategory;
    this.now = options.now ?? (() => new Date());
  }

  async discover(
    existing?: LegalInfoManifest | null,
  ): Promise<LegalInfoDiscoveryResult> {
    const discoveredAt = this.now().toISOString();
    const byLawId = new Map<string, LegalInfoManifestDocument>();

    if (existing) {
      for (const doc of existing.documents) {
        byLawId.set(doc.lawId, { ...doc });
      }
    }

    const lastDiscoveryPageByCategory: Record<string, number> = {
      ...(existing?.checkpoint.lastDiscoveryPageByCategory ?? {}),
    };

    let pagesFetched = 0;

    for (const categoryId of this.categoryIds) {
      let page = 1;
      let totalPages = 1;
      do {
        const listPage = await this.listClient.fetchPage(categoryId, page);
        pagesFetched += 1;
        totalPages = listPage.totalPages;
        lastDiscoveryPageByCategory[categoryId] = page;

        for (const item of listPage.items) {
          const previous = byLawId.get(item.lawId);
          if (previous) {
            // Preserve ingestion progress; refresh discovery metadata only.
            byLawId.set(item.lawId, {
              ...previous,
              title: item.title ?? previous.title,
              categoryId,
              sourceType: sourceTypeForCategory(categoryId),
              officialUrl: item.officialUrl,
            });
            continue;
          }
          byLawId.set(
            item.lawId,
            toPendingDocument(item, categoryId, discoveredAt),
          );
        }

        page += 1;
        if (
          this.maxPagesPerCategory != null &&
          page > this.maxPagesPerCategory
        ) {
          break;
        }
        if (page <= totalPages && this.requestDelayMs > 0) {
          await sleep(this.requestDelayMs);
        }
      } while (page <= totalPages);
    }

    const documents = [...byLawId.values()].sort((a, b) =>
      a.lawId.localeCompare(b.lawId, "en", { numeric: true }),
    );

    const base = existing ?? createEmptyManifest(this.categoryIds, this.now);
    const manifest: LegalInfoManifest = {
      ...base,
      updatedAt: discoveredAt,
      categoryIds: [...this.categoryIds],
      documents,
      checkpoint: {
        lastProcessedLawId: base.checkpoint.lastProcessedLawId,
        lastDiscoveryPageByCategory,
      },
    };

    return {
      manifest,
      discoveredCount: documents.length,
      pagesFetched,
    };
  }
}

function toPendingDocument(
  item: LegalInfoListItem,
  categoryId: string,
  discoveredAt: string,
): LegalInfoManifestDocument {
  return {
    lawId: item.lawId,
    officialUrl: item.officialUrl,
    sourceType: sourceTypeForCategory(categoryId),
    categoryId,
    title: item.title,
    discoveredAt,
    status: LegalInfoDocumentStatus.PENDING,
    failureReason: null,
    sha256: null,
    duplicateOfLawId: null,
    articleCount: null,
    chunkCount: null,
    byteSize: null,
    lastAttemptAt: null,
    completedAt: null,
    attempts: 0,
  };
}

function sourceTypeForCategory(categoryId: string): LegalInfoSourceType {
  return sourceTypeForLegalInfoCategory(categoryId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
