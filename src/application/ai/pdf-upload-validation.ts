import {
  LEGAL_AI_DOCUMENT_MAX_BYTES,
  LEGAL_AI_DOCUMENT_MIME,
  PDF_MAGIC_BYTES,
} from "@/application/ai/legal-ai-document.constants";
import { ValidationError } from "@/domain/errors/domain-error";

export type PdfUploadBytes = {
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export function hasPdfMagicBytes(body: Uint8Array): boolean {
  if (body.byteLength < PDF_MAGIC_BYTES.byteLength) {
    return false;
  }
  return PDF_MAGIC_BYTES.every((byte, index) => body[index] === byte);
}

/**
 * Server-side PDF gate. Client MIME is never sufficient on its own.
 * Does not parse or execute PDF content.
 */
export function assertValidPdfUpload(input: PdfUploadBytes): void {
  if (!input.body.byteLength) {
    throw new ValidationError("PDF файл шаардлагатай.");
  }
  if (input.body.byteLength > LEGAL_AI_DOCUMENT_MAX_BYTES) {
    throw new ValidationError("Файл 10MB-аас ихгүй байх ёстой.");
  }
  if (normalizeMime(input.contentType) !== LEGAL_AI_DOCUMENT_MIME) {
    throw new ValidationError("Зөвхөн PDF файл хавсаргана уу.");
  }
  if (!hasPdfMagicBytes(input.body)) {
    throw new ValidationError("Файл PDF биш байна.");
  }
}

function normalizeMime(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}
