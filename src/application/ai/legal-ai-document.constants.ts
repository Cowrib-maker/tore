/**
 * Legal AI Document Intelligence v0.1 — PDF-only, one document per conversation.
 *
 * MAX_DOCUMENT_EXTRACT_CHARS is a per-request prompt ceiling, not the monthly
 * token quota. SOLO's monthly input ceiling is 1_000_000 tokens
 * (`SOLO_PLAN.tokenCeilings.inputTokens`). Extracted text is re-injected on
 * every subsequent chat turn (no embeddings / RAG in v0.1), so an unbounded
 * PDF would dominate the model context and burn the monthly ceiling quickly.
 *
 * 48_000 characters is roughly 12–16k tokens of mixed Mongolian/English,
 * which leaves room for the system prompt, a 30-message history, and any
 * verified legal-source excerpts.
 */
export const LEGAL_AI_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const LEGAL_AI_DOCUMENT_MIME = "application/pdf";
export const MAX_DOCUMENT_EXTRACT_CHARS = 48_000;

export const PDF_MAGIC_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
