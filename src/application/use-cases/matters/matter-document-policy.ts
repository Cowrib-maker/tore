import {
  clientRejectLegalAiDocument,
} from "@/application/ai/legal-ai-document-file";

/**
 * Matter document upload contract for the pilot. Client-safe (no server
 * imports) so the browser and the route enforce the same numbers.
 *
 * The upload goes through a Vercel serverless function whose request body is
 * capped at ~4.5 MB (multipart overhead included), so the file limit sits
 * below that with headroom. This is intentionally NOT the 10 MB shared
 * Legal AI limit: a larger file would be cut off by the platform with a
 * non-JSON 413 before our code ever runs.
 */
export const MATTER_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
/** Multipart framing + field headers allowance on top of the file bytes. */
export const MATTER_DOCUMENT_REQUEST_OVERHEAD_BYTES = 64 * 1024;
/** Hard budget for extraction. Must stay below the route's maxDuration. */
export const MATTER_DOCUMENT_PROCESSING_TIMEOUT_MS = 20_000;
export const MATTER_DOCUMENT_ROUTE_MAX_DURATION_SECONDS = 30;
/** Client gives up slightly after the server's maxDuration. */
export const MATTER_DOCUMENT_CLIENT_TIMEOUT_MS = 40_000;

export const MATTER_DOCUMENT_FILE_ACCEPT =
  ".pdf,.docx,.xlsx,.txt,.csv,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "text/plain,text/csv";

export const MATTER_DOCUMENT_SIZE_MESSAGE =
  "Файл 4MB-аас ихгүй байх ёстой. Жижиг файл сонгоно уу.";
export const MATTER_DOCUMENT_SUPPORTED_HINT =
  "Дэмжих формат: текст бүхий PDF, DOCX, XLSX, TXT, CSV · дээд хэмжээ 4MB.";
export const MATTER_DOCUMENT_UNSUPPORTED_MESSAGE =
  "Зөвхөн текст бүхий PDF, DOCX, XLSX, TXT, CSV файл хавсаргана уу.";
export const MATTER_DOCUMENT_OCR_UNSUPPORTED_MESSAGE =
  "Скан хийсэн PDF болон зургийг (OCR) одоогоор дэмжихгүй. Текст бүхий PDF эсвэл DOCX хавсаргана уу.";
export const MATTER_DOCUMENT_TIMEOUT_MESSAGE =
  "Файлыг боловсруулах хугацаа хэтэрлээ. Жижиг эсвэл текст бүхий файлаар дахин оролдоно уу.";
export const MATTER_DOCUMENT_STORAGE_MESSAGE =
  "Файлыг хадгалж чадсангүй. Түр хүлээгээд дахин оролдоно уу.";
export const MATTER_DOCUMENT_SAVE_MESSAGE =
  "Баримтыг бүртгэж чадсангүй. Түр хүлээгээд дахин оролдоно уу.";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * Browser-side gate. Reuses the shared type/legacy checks but applies the
 * Matter size limit and refuses images (OCR is not a pilot feature).
 */
export function clientRejectMatterDocument(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (file.size > MATTER_DOCUMENT_MAX_BYTES) {
    return MATTER_DOCUMENT_SIZE_MESSAGE;
  }
  const shared = clientRejectLegalAiDocument({
    ...file,
    size: Math.min(file.size, 1),
  });
  if (shared) {
    return shared;
  }
  const name = file.name.toLowerCase();
  const extension = name.includes(".") ? `.${name.split(".").pop()}` : "";
  if (IMAGE_EXTENSIONS.has(extension) || file.type.startsWith("image/")) {
    return MATTER_DOCUMENT_OCR_UNSUPPORTED_MESSAGE;
  }
  return null;
}
