import type {
  IKnowledgeRepository,
  KnowledgeArticleHit,
  KnowledgeArticleSearchQuery,
  StoredKnowledgeDocument,
} from "../types";
import {
  filterDocumentsForSearch,
  rankDocumentsToHits,
} from "./article-search";

/**
 * In-memory knowledge store.
 *
 * Replace with a Prisma/SQL adapter implementing the same
 * {@link IKnowledgeRepository} port. Saves are keyed by `id`. The same
 * canonical version (same id) may refresh in place; a different
 * contentSha256 must use a different id so prior versions stay listed.
 */
export class InMemoryKnowledgeRepository implements IKnowledgeRepository {
  private readonly documents = new Map<string, StoredKnowledgeDocument>();

  async save(document: StoredKnowledgeDocument): Promise<StoredKnowledgeDocument> {
    const stored: StoredKnowledgeDocument = {
      ...document,
      articles: document.articles.map((article, index) => ({
        ...article,
        id: article.id ?? `${document.id}:article:${article.order ?? index}`,
      })),
      chunks: [...document.chunks],
      metadata: { ...document.metadata },
    };
    this.documents.set(stored.id, stored);
    return stored;
  }

  async findById(id: string): Promise<StoredKnowledgeDocument | null> {
    return this.documents.get(id) ?? null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<StoredKnowledgeDocument | null> {
    for (const document of this.documents.values()) {
      if (document.sourceUrl === sourceUrl) {
        return document;
      }
    }
    return null;
  }

  async listBySourceUrl(sourceUrl: string): Promise<StoredKnowledgeDocument[]> {
    return [...this.documents.values()]
      .filter((document) => document.sourceUrl === sourceUrl)
      .sort((left, right) => {
        const byTime = left.ingestedAt.getTime() - right.ingestedAt.getTime();
        if (byTime !== 0) {
          return byTime;
        }
        return left.id.localeCompare(right.id);
      });
  }

  async list(): Promise<StoredKnowledgeDocument[]> {
    return [...this.documents.values()];
  }

  async searchArticles(
    query: KnowledgeArticleSearchQuery,
  ): Promise<KnowledgeArticleHit[]> {
    const scoped = filterDocumentsForSearch(
      [...this.documents.values()],
      query,
    );
    return rankDocumentsToHits(scoped, query);
  }
}
