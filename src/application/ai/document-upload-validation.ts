import {
  JPEG_MAGIC_BYTES,
  LEGAL_AI_DOCUMENT_MAX_BYTES,
  LEGAL_AI_DOCUMENT_MIME_BY_FORMAT,
  LEGAL_AI_DOCUMENT_SIZE_MESSAGE,
  LEGAL_AI_LEGACY_DOC_MESSAGE,
  LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE,
  OLE_MAGIC_BYTES,
  PDF_MAGIC_BYTES,
  PNG_MAGIC_BYTES,
  WEBP_RIFF_BYTES,
  WEBP_WEBP_BYTES,
  ZIP_MAGIC_BYTES,
  type LegalAiDocumentFormat,
} from "@/application/ai/legal-ai-document.constants";
import { isLegacyDocFile } from "@/application/ai/legal-ai-document-file";
import { ValidationError } from "@/domain/errors/domain-error";
import { listZipEntries } from "@/domain/documents/zip-reader";

export type DocumentUploadBytes = {
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export type ValidatedLegalAiDocument = {
  format: LegalAiDocumentFormat;
  mimeType: string;
  fileName: string;
};

export function hasPdfMagicBytes(body: Uint8Array): boolean {
  return hasPrefix(body, PDF_MAGIC_BYTES);
}

export function detectLegalAiDocumentFormat(
  body: Uint8Array,
): LegalAiDocumentFormat | "doc" | "text" | null {
  if (hasPrefix(body, PDF_MAGIC_BYTES)) {
    return "pdf";
  }
  if (hasPrefix(body, OLE_MAGIC_BYTES)) {
    return "doc";
  }
  if (isJpeg(body)) {
    return "jpeg";
  }
  if (hasPrefix(body, PNG_MAGIC_BYTES)) {
    return "png";
  }
  if (isWebp(body)) {
    return "webp";
  }
  if (hasPrefix(body, ZIP_MAGIC_BYTES)) {
    return detectOoxmlFormat(body);
  }
  if (looksLikePlainText(body)) {
    return "text";
  }
  return null;
}

/**
 * .docx, .xlsx, and .pptx are all ZIP archives sharing the same "PK" magic
 * bytes — the actual kind only shows up in which OOXML part is inside.
 * pptx is deliberately not returned as a known format: not yet supported,
 * and returning null here (rather than mis-detecting it as docx/xlsx) keeps
 * assertValidLegalAiDocumentUpload's cross-check from being spoofable by
 * renaming a .pptx to .docx.
 */
function detectOoxmlFormat(body: Uint8Array): "docx" | "xlsx" | null {
  try {
    const names = new Set(listZipEntries(body).map((entry) => entry.name));
    if (names.has("xl/workbook.xml")) return "xlsx";
    if (names.has("word/document.xml")) return "docx";
    return null;
  } catch {
    return null;
  }
}

/**
 * .txt/.csv have no magic bytes, so this is a heuristic, not a signature
 * check: reject NUL bytes outright (a strong binary signal) and reject
 * bodies with more than a token amount of non-whitespace control bytes.
 * A mislabeled binary file that slips through only means a garbled/EMPTY
 * extract downstream, not a security issue (unlike the OOXML/PDF checks
 * above, this format is never treated as executable or parsed structurally).
 */
function looksLikePlainText(body: Uint8Array): boolean {
  if (body.byteLength === 0) {
    return false;
  }
  const sample = body.subarray(0, Math.min(body.byteLength, 8192));
  let controlBytes = 0;
  for (const byte of sample) {
    if (byte === 0x00) {
      return false;
    }
    const isWhitespaceControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (byte < 0x20 && !isWhitespaceControl) {
      controlBytes += 1;
    }
  }
  return controlBytes / sample.length < 0.01;
}

/**
 * Server-side Legal AI attachment gate. Client MIME is never sufficient.
 * ZIP magic (shared by docx/xlsx/pptx) is resolved by peeking at which
 * OOXML part is actually inside, then cross-checked against the claimed
 * name/MIME so a renamed file cannot smuggle in as a different format
 * (pptx is not a supported format at all, so it is rejected either way).
 * Legacy .doc is always rejected.
 */
export function assertValidLegalAiDocumentUpload(
  input: DocumentUploadBytes,
): ValidatedLegalAiDocument {
  if (!input.body.byteLength) {
    throw new ValidationError(LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE);
  }
  if (input.body.byteLength > LEGAL_AI_DOCUMENT_MAX_BYTES) {
    throw new ValidationError(LEGAL_AI_DOCUMENT_SIZE_MESSAGE);
  }
  if (isLegacyDocFile(input.fileName, input.contentType)) {
    throw new ValidationError(LEGAL_AI_LEGACY_DOC_MESSAGE);
  }

  const detected = detectLegalAiDocumentFormat(input.body);
  if (detected === "doc") {
    throw new ValidationError(LEGAL_AI_LEGACY_DOC_MESSAGE);
  }
  if (!detected) {
    throw new ValidationError(LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE);
  }

  const claimed = claimedFormat(input.fileName, input.contentType);

  if (detected === "text") {
    // No magic bytes to detect txt vs csv apart — the extension/MIME the
    // client claimed is the only signal, so it decides the final format.
    if (claimed !== "txt" && claimed !== "csv") {
      throw new ValidationError(LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE);
    }
    return {
      format: claimed,
      mimeType: LEGAL_AI_DOCUMENT_MIME_BY_FORMAT[claimed],
      fileName: input.fileName,
    };
  }

  if (detected === "docx" && claimed !== "docx") {
    throw new ValidationError(LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE);
  }
  if (detected === "xlsx" && claimed !== "xlsx") {
    throw new ValidationError(LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE);
  }
  if (claimed && claimed !== detected && !(jpegAlias(claimed) && detected === "jpeg")) {
    throw new ValidationError(LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE);
  }

  return {
    format: detected,
    mimeType: LEGAL_AI_DOCUMENT_MIME_BY_FORMAT[detected],
    fileName: input.fileName,
  };
}

function claimedFormat(
  fileName: string,
  contentType: string,
): LegalAiDocumentFormat | "doc" | null {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "docx";
  }
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    extension === "xlsx"
  ) {
    return "xlsx";
  }
  if (
    mime === "application/msword" ||
    mime === "application/x-msword" ||
    extension === "doc"
  ) {
    return "doc";
  }
  if (mime === "image/jpeg" || mime === "image/jpg" || extension === "jpg" || extension === "jpeg") {
    return "jpeg";
  }
  if (mime === "image/png" || extension === "png") return "png";
  if (mime === "image/webp" || extension === "webp") return "webp";
  if (mime === "text/plain" || extension === "txt") return "txt";
  if (mime === "text/csv" || extension === "csv") return "csv";
  return null;
}

function jpegAlias(format: LegalAiDocumentFormat | "doc"): boolean {
  return format === "jpeg";
}

function isJpeg(body: Uint8Array): boolean {
  return hasPrefix(body, JPEG_MAGIC_BYTES);
}

function isWebp(body: Uint8Array): boolean {
  if (body.byteLength < 12) {
    return false;
  }
  return (
    hasPrefix(body, WEBP_RIFF_BYTES) &&
    body[8] === WEBP_WEBP_BYTES[0] &&
    body[9] === WEBP_WEBP_BYTES[1] &&
    body[10] === WEBP_WEBP_BYTES[2] &&
    body[11] === WEBP_WEBP_BYTES[3]
  );
}

function hasPrefix(body: Uint8Array, prefix: Uint8Array): boolean {
  if (body.byteLength < prefix.byteLength) {
    return false;
  }
  return prefix.every((byte, index) => body[index] === byte);
}
