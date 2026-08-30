import {
  LEGAL_AI_DOCUMENT_MAX_BYTES,
  LEGAL_AI_DOCUMENT_SIZE_MESSAGE,
  LEGAL_AI_LEGACY_DOC_MESSAGE,
  LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE,
} from "@/application/ai/legal-ai-document.constants";

const ACCEPTED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const ACCEPTED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function isLegacyDocFile(fileName: string, contentType = ""): boolean {
  const name = fileName.toLowerCase();
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (name.endsWith(".docx")) {
    return false;
  }
  return (
    name.endsWith(".doc") ||
    mime === "application/msword" ||
    mime === "application/x-msword" ||
    mime === "application/vnd.ms-word"
  );
}

export function clientRejectLegalAiDocument(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (file.size <= 0) {
    return LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE;
  }
  if (file.size > LEGAL_AI_DOCUMENT_MAX_BYTES) {
    return LEGAL_AI_DOCUMENT_SIZE_MESSAGE;
  }
  if (isLegacyDocFile(file.name, file.type)) {
    return LEGAL_AI_LEGACY_DOC_MESSAGE;
  }
  const name = file.name.toLowerCase();
  const mime = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = name.includes(".") ? `.${name.split(".").pop()}` : "";
  if (ACCEPTED_EXTENSIONS.has(extension) || ACCEPTED_MIMES.has(mime)) {
    return null;
  }
  return LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE;
}

export function legalAiExtractStatusHint(status: string): string | null {
  if (status === "NEEDS_OCR") {
    return "OCR шаардлагатай";
  }
  if (status === "EMPTY" || status === "FAILED") {
    return "текст уншигдаагүй";
  }
  return null;
}
