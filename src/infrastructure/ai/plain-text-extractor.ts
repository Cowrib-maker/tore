import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";
import { boundExtractedStructuredText } from "@/infrastructure/ai/docx-text-extractor";

export type PlainTextExtractStatus = "OK" | "EMPTY" | "FAILED";

export type PlainTextExtractResult = {
  status: PlainTextExtractStatus;
  text: string;
  pageCount: null;
};

export type PlainTextExtractor = {
  extract(body: Uint8Array): Promise<PlainTextExtractResult>;
};

/**
 * TXT/CSV extractor: the file already IS text, so this is a decode-and-trim
 * step, not real extraction. A byte-order-mark is stripped if present.
 * Uses "fatal: false" so any stray non-UTF-8 byte becomes U+FFFD rather than
 * throwing — the upload-time looksLikePlainText heuristic already screened
 * out obvious binaries, so a full decode failure here should be rare, and
 * degrading gracefully beats rejecting a mostly-fine file over one bad byte.
 */
export class Utf8PlainTextExtractor implements PlainTextExtractor {
  async extract(body: Uint8Array): Promise<PlainTextExtractResult> {
    if (body.byteLength === 0) {
      return { status: "EMPTY", text: "", pageCount: null };
    }
    try {
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(body);
      const withoutBom = decoded.replace(/^﻿/, "");
      const text = boundExtractedStructuredText(withoutBom);
      if (!text) {
        return { status: "EMPTY", text: "", pageCount: null };
      }
      return {
        status: "OK",
        text: text.slice(0, MAX_DOCUMENT_EXTRACT_CHARS),
        pageCount: null,
      };
    } catch {
      return { status: "FAILED", text: "", pageCount: null };
    }
  }
}

let singleton: PlainTextExtractor | undefined;

export function getPlainTextExtractor(): PlainTextExtractor {
  singleton ??= new Utf8PlainTextExtractor();
  return singleton;
}
