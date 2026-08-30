import mammoth from "mammoth";

import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";

export type DocxExtractStatus = "OK" | "EMPTY" | "FAILED";

export type DocxExtractResult = {
  status: DocxExtractStatus;
  text: string;
  pageCount: null;
};

export type DocxTextExtractor = {
  extract(body: Uint8Array): Promise<DocxExtractResult>;
};

/**
 * Native DOCX text extractor via mammoth HTML conversion.
 * Preserves paragraph breaks and list numbering where mammoth exposes them.
 * Does not parse legacy .doc. Does not run OCR or a completion API.
 */
export class MammothDocxTextExtractor implements DocxTextExtractor {
  async extract(body: Uint8Array): Promise<DocxExtractResult> {
    try {
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(body) });
      const text = htmlToStructuredText(result.value);
      if (!text) {
        return { status: "EMPTY", text: "", pageCount: null };
      }
      return { status: "OK", text, pageCount: null };
    } catch {
      return { status: "FAILED", text: "", pageCount: null };
    }
  }
}

export function htmlToStructuredText(html: string): string {
  const withLists = html
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
      let index = 0;
      const items = inner.replace(/<li\b[^>]*>/gi, () => {
        index += 1;
        return `${index}. `;
      });
      return `\n${items}\n`;
    })
    .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_match, inner: string) => {
      return `\n${inner.replace(/<li\b[^>]*>/gi, "• ")}\n`;
    })
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return boundExtractedStructuredText(withLists);
}

export function boundExtractedStructuredText(text: string): string {
  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= MAX_DOCUMENT_EXTRACT_CHARS) {
    return normalized;
  }
  return normalized.slice(0, MAX_DOCUMENT_EXTRACT_CHARS);
}

let singleton: DocxTextExtractor | undefined;

export function getDocxTextExtractor(): DocxTextExtractor {
  singleton ??= new MammothDocxTextExtractor();
  return singleton;
}
