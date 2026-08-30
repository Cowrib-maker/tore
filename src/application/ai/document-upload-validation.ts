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
): LegalAiDocumentFormat | "doc" | null {
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
    return "docx";
  }
  return null;
}

/**
 * Server-side Legal AI attachment gate. Client MIME is never sufficient.
 * ZIP magic is accepted as DOCX only when the name/MIME claim DOCX
 * (xlsx/pptx are rejected). Legacy .doc is always rejected.
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
  if (detected === "docx" && claimed !== "docx") {
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
