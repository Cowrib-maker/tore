import { createHash } from "node:crypto";

import type {
  IKnowledgeChunker,
  KnowledgeChunk,
  NormalizedKnowledgeDocument,
} from "../types";

const DEFAULT_MAX_CHARS = 800;

/**
 * Paragraph-aware chunker.
 *
 * Does not create embeddings or call a model. Token estimates are
 * character-based (`ceil(length / 4)`) for budgeting only.
 */
export class ParagraphKnowledgeChunker implements IKnowledgeChunker {
  constructor(private readonly maxChars: number = DEFAULT_MAX_CHARS) {}

  /**
   * Splits each article into windows of at most `maxChars`.
   */
  chunk(
    document: NormalizedKnowledgeDocument,
    documentId: string,
  ): KnowledgeChunk[] {
    const chunks: KnowledgeChunk[] = [];
    let order = 0;

    for (const article of document.articles) {
      const windows = splitWindows(article.text, this.maxChars);
      for (const text of windows) {
        chunks.push({
          id: chunkId(documentId, order),
          documentId,
          articleNumber: article.articleNumber,
          order,
          text,
          tokenEstimate: Math.ceil(text.length / 4),
        });
        order += 1;
      }
    }

    return chunks;
  }
}

function splitWindows(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return text ? [text] : [];
  }

  const words = text.split(" ");
  const windows: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      windows.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    windows.push(current);
  }
  return windows;
}

function chunkId(documentId: string, order: number): string {
  return createHash("sha256")
    .update(`${documentId}:${order}`)
    .digest("hex")
    .slice(0, 32);
}
