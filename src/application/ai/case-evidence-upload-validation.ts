/**
 * Mobile camera/photo upload fix (TORE.MN production-readiness mission,
 * Phase 2): Case Review's evidence upload was PDF-only, client AND
 * server (assertValidPdfUpload in pdf-upload-validation.ts) — on a
 * mobile OS file picker, `accept="application/pdf"` filters the Camera
 * and Photos options out entirely, so a lawyer could not attach a photo
 * of a document to a case at all. `assertValidPdfUpload` itself is left
 * completely untouched (its own test explicitly codifies "rejects
 * images" as its contract) — this is a NEW, separate, additive
 * validator for Case Review evidence specifically, accepting PDF or a
 * photo (JPEG/PNG/WEBP).
 *
 * Reuses detectLegalAiDocumentFormat (document-upload-validation.ts) for
 * magic-byte format detection rather than re-implementing signature
 * checks, but only accepts a NARROWER set of formats than the Legal AI
 * chat attachment path — no docx/xlsx/txt/csv here; those were never
 * part of Case Review evidence upload and adding them is out of this
 * mission's scope.
 *
 * Does not run OCR or any content extraction — matching the existing,
 * deliberate "case evidence is stored, not analyzed" behavior that
 * already applied to PDFs (see attachCasePdfForLawyer's own doc
 * comment); this extends the same storage-only behavior to photos, not
 * a new capability.
 */

import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import { detectLegalAiDocumentFormat } from "@/application/ai/document-upload-validation";
import { ValidationError } from "@/domain/errors/domain-error";

export type CaseEvidenceUploadBytes = {
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export type CaseEvidenceUploadFormat = "pdf" | "jpeg" | "png" | "webp";

export type ValidatedCaseEvidenceUpload = {
  format: CaseEvidenceUploadFormat;
  mimeType: string;
  fileName: string;
};

const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(["pdf", "jpeg", "png", "webp"]);

const MIME_BY_FORMAT: Record<CaseEvidenceUploadFormat, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const UNSUPPORTED_FORMAT_MESSAGE = "Зөвхөн PDF эсвэл зураг (JPEG, PNG, WEBP) хавсаргана уу.";

/**
 * Server-side gate for Case Review evidence uploads. Client-claimed MIME
 * type is never sufficient on its own — the actual format is always
 * re-derived from the file's magic bytes.
 */
export function assertValidCaseEvidenceUpload(
  input: CaseEvidenceUploadBytes,
): ValidatedCaseEvidenceUpload {
  if (!input.body.byteLength) {
    throw new ValidationError("Файл шаардлагатай.");
  }
  if (input.body.byteLength > LEGAL_AI_DOCUMENT_MAX_BYTES) {
    throw new ValidationError("Файл 10MB-аас ихгүй байх ёстой.");
  }

  const detected = detectLegalAiDocumentFormat(input.body);
  if (!detected || !ACCEPTED_FORMATS.has(detected)) {
    throw new ValidationError(UNSUPPORTED_FORMAT_MESSAGE);
  }

  const format = detected as CaseEvidenceUploadFormat;
  return {
    format,
    mimeType: MIME_BY_FORMAT[format],
    fileName: input.fileName,
  };
}
