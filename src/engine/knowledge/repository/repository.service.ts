import type {
  IKnowledgeRepository,
  StoredKnowledgeDocument,
} from "../types";

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
    const stored = {
      ...document,
      articles: [...document.articles],
      chunks: [...document.chunks],
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
}
