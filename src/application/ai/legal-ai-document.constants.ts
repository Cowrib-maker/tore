/**
 * Legal AI document attachments — PDF, DOCX, and raster images.
 * Multiple documents per conversation. Extracted text is re-injected on
 * every subsequent chat turn (no embeddings / RAG), so an unbounded file
 * would dominate the model context and burn the monthly ceiling quickly.
 *
 * MAX_DOCUMENT_EXTRACT_CHARS is a per-request prompt ceiling, not the monthly
 * token quota. SOLO's monthly input ceiling is 600_000 tokens
 * (`SOLO_PLAN.tokenCeilings.inputTokens`).
 *
 * 48_000 characters is roughly 12–16k tokens of mixed Mongolian/English,
 * which leaves room for the system prompt, a 30-message history, and any
 * verified legal-source excerpts.
 *
 * File-size limit matches the existing application cap (10 MB).
 */
export const LEGAL_AI_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
/** @deprecated PDF-only MIME for Case Review uploads. Prefer LEGAL_AI_DOCUMENT_MIMES. */
export const LEGAL_AI_DOCUMENT_MIME = "application/pdf";
export const MAX_DOCUMENT_EXTRACT_CHARS = 48_000;

export const PDF_MAGIC_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
export const ZIP_MAGIC_BYTES = new Uint8Array([0x50, 0x4b]); // PK
export const JPEG_MAGIC_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);
export const PNG_MAGIC_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
export const WEBP_RIFF_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF
export const WEBP_WEBP_BYTES = new Uint8Array([0x57, 0x45, 0x42, 0x50]); // WEBP
export const OLE_MAGIC_BYTES = new Uint8Array([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]); // legacy .doc

export const LEGAL_AI_PDF_MIME = "application/pdf";
export const LEGAL_AI_DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const LEGAL_AI_JPEG_MIME = "image/jpeg";
export const LEGAL_AI_PNG_MIME = "image/png";
export const LEGAL_AI_WEBP_MIME = "image/webp";

export const LEGAL_AI_DOCUMENT_FORMATS = [
  "pdf",
  "docx",
  "jpeg",
  "png",
  "webp",
] as const;

export type LegalAiDocumentFormat = (typeof LEGAL_AI_DOCUMENT_FORMATS)[number];

export const LEGAL_AI_DOCUMENT_EXTRACT_STATUSES = [
  "OK",
  "EMPTY",
  "FAILED",
  "NEEDS_OCR",
] as const;

export type LegalAiDocumentExtractStatus =
  (typeof LEGAL_AI_DOCUMENT_EXTRACT_STATUSES)[number];

export const LEGAL_AI_DOCUMENT_MIME_BY_FORMAT: Record<
  LegalAiDocumentFormat,
  string
> = {
  pdf: LEGAL_AI_PDF_MIME,
  docx: LEGAL_AI_DOCX_MIME,
  jpeg: LEGAL_AI_JPEG_MIME,
  png: LEGAL_AI_PNG_MIME,
  webp: LEGAL_AI_WEBP_MIME,
};

export const LEGAL_AI_DOCUMENT_MIMES = [
  LEGAL_AI_PDF_MIME,
  LEGAL_AI_DOCX_MIME,
  LEGAL_AI_JPEG_MIME,
  LEGAL_AI_PNG_MIME,
  LEGAL_AI_WEBP_MIME,
] as const;

export const LEGAL_AI_DOCUMENT_FILE_ACCEPT = [
  ".pdf",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  LEGAL_AI_PDF_MIME,
  LEGAL_AI_DOCX_MIME,
  LEGAL_AI_JPEG_MIME,
  LEGAL_AI_PNG_MIME,
  LEGAL_AI_WEBP_MIME,
].join(",");

export const LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE =
  "Зөвхөн PDF, DOCX, JPG, JPEG, PNG, WEBP файл хавсаргана уу.";
export const LEGAL_AI_LEGACY_DOC_MESSAGE =
  "Хуучин .doc файлыг дэмжихгүй. .docx форматаар хадгалаад дахин хавсаргана уу.";
export const LEGAL_AI_DOCUMENT_SIZE_MESSAGE =
  "Файл 10MB-аас ихгүй байх ёстой.";
export const LEGAL_AI_OCR_FAILED_MESSAGE =
  "OCR уншилт амжилтгүй боллоо. Файлыг шалгаад дахин оролдоно уу.";
export const LEGAL_AI_OCR_EMPTY_MESSAGE =
  "OCR-оос уншигдах текст олдсонгүй.";
export const LEGAL_AI_OCR_TIMEOUT_MESSAGE =
  "OCR уншилт хугацаа хэтэрлээ. Файлыг шалгаад дахин оролдоно уу.";

/** Per-image OCR budget. Scanned PDFs OCR at most OCR_MAX_PDF_PAGES pages. */
export const OCR_TIMEOUT_MS = 25_000;
export const OCR_MAX_PDF_PAGES = 8;
export const OCR_MAX_IMAGES_PER_PAGE = 4;
/** Skip tiny decorative bitmaps (icons), not stamps/clauses. */
export const OCR_MIN_IMAGE_EDGE_PX = 32;
/**
 * Tesseract language packs: English + Mongolian (Cyrillic `mon`).
 * `mon` is a real Tesseract traineddata code. Quality is not legal-grade.
 */
export const OCR_LANGUAGES = "eng+mon";
