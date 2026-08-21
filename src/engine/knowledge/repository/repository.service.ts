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
 * {@link IKnowledgeRepository} port. Saves are keyed by `id`; a second
 * save with the same id replaces the record (source-of-truth upsert).
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
