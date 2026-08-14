import type {
  IKnowledgeExporter,
  KnowledgeExport,
  StoredKnowledgeDocument,
} from "../types";

/**
 * JSON snapshot exporter.
 *
 * Does not write to disk. Adapters persist {@link KnowledgeExport} through
 * storage ports outside this engine.
 */
export class JsonKnowledgeExporter implements IKnowledgeExporter {
  /**
   * Builds a versioned, JSON-serializable snapshot of `documents`.
   */
  exportAll(documents: StoredKnowledgeDocument[]): KnowledgeExport {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      documentCount: documents.length,
      documents: documents.map((document) => ({
        ...document,
        articles: [...document.articles],
        chunks: [...document.chunks],
      })),
    };
  }
}
