import type { LegalAiDocumentExtractStatus } from "@/application/ai/legal-ai-document.constants";
import type { LegalAiDocumentFormat } from "@/application/ai/legal-ai-document.constants";
import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";
import {
  getDocxTextExtractor,
  type DocxTextExtractor,
} from "@/infrastructure/ai/docx-text-extractor";
import type { OcrEngine, OcrRecognizeResult } from "@/infrastructure/ai/ocr-engine";
import {
  getPdfEmbeddedImageExtractor,
  type PdfEmbeddedImageExtractor,
} from "@/infrastructure/ai/pdf-embedded-image-extractor";
import {
  getPdfTextExtractor,
  type PdfTextExtractor,
} from "@/infrastructure/ai/pdf-text-extractor";

export type DocumentExtractResult = {
  status: LegalAiDocumentExtractStatus;
  text: string;
  pageCount: number | null;
  timedOut?: boolean;
};

export type LegalAiDocumentExtractor = {
  extract(input: {
    format: LegalAiDocumentFormat;
    body: Uint8Array;
  }): Promise<DocumentExtractResult>;
};

const IMAGE_FORMATS = new Set<LegalAiDocumentFormat>([
  "jpeg",
  "png",
  "webp",
]);

/**
 * Format dispatcher. Native PDF/DOCX extractors are unchanged.
 * Images and native-empty PDFs go through the OCR engine (in-memory bytes only).
 */
export class LegalAiDocumentExtractorService implements LegalAiDocumentExtractor {
  constructor(
    private readonly pdf: PdfTextExtractor = getPdfTextExtractor(),
    private readonly docx: DocxTextExtractor = getDocxTextExtractor(),
    private readonly ocr?: OcrEngine,
    private readonly pdfImages: PdfEmbeddedImageExtractor = getPdfEmbeddedImageExtractor(),
  ) {}

  async extract(input: {
    format: LegalAiDocumentFormat;
    body: Uint8Array;
  }): Promise<DocumentExtractResult> {
    if (IMAGE_FORMATS.has(input.format)) {
      return this.ocrImage(input.body);
    }

    if (input.format === "pdf") {
      const extracted = await this.pdf.extract(input.body);
      if (extracted.status === "EMPTY") {
        return this.ocrScannedPdf(input.body, extracted.pageCount);
      }
      return extracted;
    }

    if (input.format === "docx") {
      return this.docx.extract(input.body);
    }

    return { status: "FAILED", text: "", pageCount: null };
  }

  private async resolveOcr(): Promise<OcrEngine> {
    if (this.ocr) {
      return this.ocr;
    }
    const { getOcrEngine } = await import(
      "@/infrastructure/ai/tesseract-ocr-engine"
    );
    return getOcrEngine();
  }

  private async ocrImage(body: Uint8Array): Promise<DocumentExtractResult> {
    const engine = await this.resolveOcr();
    return toExtractResult(await engine.recognize({ bytes: body }), null);
  }

  private async ocrScannedPdf(
    body: Uint8Array,
    nativePageCount: number | null,
  ): Promise<DocumentExtractResult> {
    let extracted;
    try {
      extracted = await this.pdfImages.extract(body);
    } catch {
      return { status: "FAILED", text: "", pageCount: nativePageCount };
    }

    const pageCount = nativePageCount ?? extracted.pageCount;
    if (extracted.images.length === 0) {
      return { status: "NEEDS_OCR", text: "", pageCount };
    }

    const engine = await this.resolveOcr();
    const byPage = new Map<number, string[]>();
    for (const image of extracted.images) {
      const recognized = await engine.recognize({ bytes: image.bytes });
      if (recognized.status === "FAILED") {
        return {
          status: "FAILED",
          text: "",
          pageCount,
          timedOut: recognized.timedOut,
        };
      }
      if (recognized.status === "OK" && recognized.text) {
        const parts = byPage.get(image.pageNumber) ?? [];
        parts.push(recognized.text);
        byPage.set(image.pageNumber, parts);
      }
    }

    const pages = [...byPage.keys()].sort((a, b) => a - b);
    if (pages.length === 0) {
      return { status: "EMPTY", text: "", pageCount };
    }

    const combined = pages
      .map(
        (page) =>
          `--- Page ${page} ---\n${(byPage.get(page) ?? []).join("\n\n")}`,
      )
      .join("\n\n")
      .slice(0, MAX_DOCUMENT_EXTRACT_CHARS)
      .trim();

    if (!combined) {
      return { status: "EMPTY", text: "", pageCount };
    }
    return { status: "OK", text: combined, pageCount };
  }
}

function toExtractResult(
  recognized: OcrRecognizeResult,
  pageCount: number | null,
): DocumentExtractResult {
  if (recognized.status === "OK" && recognized.text) {
    return { status: "OK", text: recognized.text, pageCount };
  }
  if (recognized.status === "EMPTY") {
    return { status: "EMPTY", text: "", pageCount };
  }
  return {
    status: "FAILED",
    text: "",
    pageCount,
    timedOut: recognized.timedOut,
  };
}

let singleton: LegalAiDocumentExtractor | undefined;

export function getLegalAiDocumentExtractor(): LegalAiDocumentExtractor {
  singleton ??= new LegalAiDocumentExtractorService();
  return singleton;
}
