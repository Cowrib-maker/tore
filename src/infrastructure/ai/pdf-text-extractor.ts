import { extractText, getDocumentProxy } from "unpdf";

import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";

export type PdfExtractStatus = "OK" | "EMPTY" | "FAILED";

export type PdfExtractResult = {
  status: PdfExtractStatus;
  text: string;
  pageCount: number | null;
};

export type PdfTextExtractor = {
  extract(body: Uint8Array): Promise<PdfExtractResult>;
};

/**
 * Native-text PDF extractor. No OCR, no chat-completion API, no embedded-content execution.
 * Scanned/image-only PDFs return EMPTY rather than a guessed transcription.
 */
export class UnpdfTextExtractor implements PdfTextExtractor {
  async extract(body: Uint8Array): Promise<PdfExtractResult> {
    try {
      const pdf = await getDocumentProxy(body);
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const bounded = boundExtractedText(text);
      if (!bounded) {
        return { status: "EMPTY", text: "", pageCount: totalPages ?? null };
      }
      return {
        status: "OK",
        text: bounded,
        pageCount: totalPages ?? null,
      };
    } catch {
      return { status: "FAILED", text: "", pageCount: null };
    }
  }
}

export function boundExtractedText(text: string): string {
  const normalized = text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= MAX_DOCUMENT_EXTRACT_CHARS) {
    return normalized;
  }
  return normalized.slice(0, MAX_DOCUMENT_EXTRACT_CHARS);
}

let singleton: PdfTextExtractor | undefined;

export function getPdfTextExtractor(): PdfTextExtractor {
  singleton ??= new UnpdfTextExtractor();
  return singleton;
}
