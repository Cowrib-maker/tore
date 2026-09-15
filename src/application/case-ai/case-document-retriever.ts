import type { CaseEvidenceRecord } from "@/domain/entities/case-file";

/**
 * Sprint 13 Phase 4 — deterministic retrieval over authorized case-document
 * text. Deliberately NOT a vector/embeddings index: this repo has no
 * production-ready vector infrastructure, and per the milestone brief a
 * deterministic local strategy is preferred for V1. Every call site is
 * expected to pass ONLY the evidence of a single already-ownership-checked
 * CaseFile — this module has no database access and no notion of "case" or
 * "user" of its own, so it cannot cross a case/user boundary by construction.
 */

const MAX_RESULTS_DEFAULT = 8;
const CHUNK_SIZE_DEFAULT = 700;
const CHUNK_OVERLAP_DEFAULT = 120;
const MIN_KEYWORD_LENGTH = 2;

/** Mongolian + English stopwords worth excluding from keyword scoring —
 * short, low-signal function words that would otherwise dominate scoring
 * on every chunk. Not exhaustive; scoring degrades gracefully if a
 * stopword slips through (it just contributes less distinctively). */
const STOPWORDS = new Set([
  "нь",
  "нэг",
  "энэ",
  "тэр",
  "бол",
  "бас",
  "буюу",
  "байна",
  "гэж",
  "гэсэн",
  "болон",
  "the",
  "and",
  "or",
  "of",
  "to",
  "a",
  "an",
  "is",
  "in",
]);

export type CaseDocumentExcerpt = {
  sourceEvidenceId: string;
  sourceTitle: string;
  excerpt: string;
  /** Chunk start offset within the source document's extractedText —
   * useful for de-duplicating overlapping windows, not shown to users. */
  chunkStart: number;
  relevanceScore: number;
};

export type RetrieveCaseDocumentExcerptsOptions = {
  maxResults?: number;
  chunkSize?: number;
  chunkOverlap?: number;
};

function normalize(text: string): string {
  return text.toLowerCase();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_KEYWORD_LENGTH && !STOPWORDS.has(token));
}

function extractKeywords(query: string): string[] {
  return Array.from(new Set(tokenize(query)));
}

/** Splits text into overlapping windows on whitespace boundaries where
 * possible, so an excerpt reads as whole words rather than a mid-word cut. */
function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): { text: string; start: number }[] {
  const chunks: { text: string; start: number }[] = [];
  if (text.length === 0) return chunks;
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < text.length; start += step) {
    let end = Math.min(text.length, start + chunkSize);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + chunkSize / 2) {
        end = lastSpace;
      }
    }
    const slice = text.slice(start, end).trim();
    if (slice) {
      chunks.push({ text: slice, start });
    }
    if (end >= text.length) break;
  }
  return chunks;
}

function scoreChunk(chunkLower: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 0;
  let hits = 0;
  for (const keyword of keywords) {
    const occurrences = chunkLower.split(keyword).length - 1;
    hits += occurrences;
  }
  // Normalize by keyword count so a query with many terms doesn't
  // structurally outscore a query with few terms on an equally relevant chunk.
  return hits / keywords.length;
}

/**
 * Deterministic keyword/lexical retrieval over the OK-extracted text of a
 * single, already-authorized CaseFile's evidence. Bounded result count,
 * sensible chunking, source id + excerpt + relevance score retained per
 * result — see the milestone brief's exact requirements.
 */
export function retrieveCaseDocumentExcerpts(
  evidence: readonly CaseEvidenceRecord[],
  query: string,
  options?: RetrieveCaseDocumentExcerptsOptions,
): CaseDocumentExcerpt[] {
  const maxResults = options?.maxResults ?? MAX_RESULTS_DEFAULT;
  const chunkSize = options?.chunkSize ?? CHUNK_SIZE_DEFAULT;
  const chunkOverlap = options?.chunkOverlap ?? CHUNK_OVERLAP_DEFAULT;
  const keywords = extractKeywords(query);

  const scored: CaseDocumentExcerpt[] = [];
  for (const item of evidence) {
    if (item.extractStatus !== "OK" || !item.extractedText.trim()) {
      continue;
    }
    const chunks = chunkText(item.extractedText, chunkSize, chunkOverlap);
    for (const chunk of chunks) {
      const score = scoreChunk(normalize(chunk.text), keywords);
      if (score <= 0) continue;
      scored.push({
        sourceEvidenceId: item.id,
        sourceTitle: item.title,
        excerpt: chunk.text,
        chunkStart: chunk.start,
        relevanceScore: score,
      });
    }
  }

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored.slice(0, maxResults);
}
