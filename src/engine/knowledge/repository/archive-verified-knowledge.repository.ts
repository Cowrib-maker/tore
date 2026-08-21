/**
 * Knowledge repository decorator: refuse to persist a document unless its
 * original archive snapshot exists and the blob checksum verifies.
 */

import type { ArchiveService } from "@/engine/data/archive";
import type {
  IKnowledgeRepository,
  KnowledgeArticleHit,
  KnowledgeArticleSearchQuery,
  StoredKnowledgeDocument,
} from "../types";

export class ArchiveVerifiedKnowledgeRepository
  implements IKnowledgeRepository
{
  constructor(
    private readonly inner: IKnowledgeRepository,
    private readonly archive: ArchiveService,
  ) {}

  async save(document: StoredKnowledgeDocument): Promise<StoredKnowledgeDocument> {
    const provenance = document.provenance;
    if (!provenance?.sha256 || !provenance.archiveId) {
      throw new Error(
        "refusing to persist knowledge without archive provenance",
      );
    }

    const record = await this.archive.verifyArchiveIntegrity(provenance.sha256);
    if (record.archiveId !== provenance.archiveId) {
      throw new Error(
        `archive id mismatch: expected ${provenance.archiveId}, found ${record.archiveId}`,
      );
    }

    const existing = await this.inner.findBySourceUrl(document.sourceUrl);
    if (
      existing?.provenance?.sha256 === provenance.sha256 &&
      existing.id === document.id
    ) {
      return existing;
    }

    // Idempotent when same content hash already stored under this URL.
    const all = await this.inner.list();
    const duplicate = all.find(
      (doc) =>
        doc.sourceUrl === document.sourceUrl &&
        doc.provenance?.sha256 === provenance.sha256,
    );
    if (duplicate) {
      return duplicate;
    }

    return this.inner.save({
      ...document,
      provenance: {
        archiveId: record.archiveId,
        sha256: record.sha256,
        originalUrl: record.originalUrl,
        lawId: provenance.lawId ?? record.lawId,
      },
    });
  }

  findById(id: string) {
    return this.inner.findById(id);
  }

  findBySourceUrl(sourceUrl: string) {
    return this.inner.findBySourceUrl(sourceUrl);
  }

  list() {
    return this.inner.list();
  }

  searchArticles(
    query: KnowledgeArticleSearchQuery,
  ): Promise<KnowledgeArticleHit[]> {
    return this.inner.searchArticles(query);
  }
}
