import { describe, expect, it, vi } from "vitest";

import { htmlToStructuredText, MammothDocxTextExtractor } from "@/infrastructure/ai/docx-text-extractor";
import { LegalAiDocumentExtractorService } from "@/infrastructure/ai/document-text-extractor";
import type { OcrEngine } from "@/infrastructure/ai/ocr-engine";
import type { PdfEmbeddedImageExtractor } from "@/infrastructure/ai/pdf-embedded-image-extractor";

import { buildMinimalDocx } from "./helpers/minimal-docx";

function ocrOk(text = "OCR clause"): OcrEngine {
  return {
    recognize: vi.fn(async () => ({
      status: "OK" as const,
      text,
      confidence: 88,
    })),
  };
}

function noPdfImages(): PdfEmbeddedImageExtractor {
  return {
    extract: vi.fn(async () => ({ pageCount: 1, images: [] })),
  };
}

describe("DOCX structured text", () => {
  it("preserves paragraphs and ordered numbering", () => {
    const text = htmlToStructuredText(
      "<p>First paragraph</p><p>Second paragraph</p><ol><li>Alpha</li><li>Beta</li></ol>",
    );
    expect(text).toContain("First paragraph");
    expect(text).toContain("Second paragraph");
    expect(text).toContain("1. Alpha");
    expect(text).toContain("2. Beta");
    expect(text.indexOf("First paragraph")).toBeLessThan(text.indexOf("Second paragraph"));
  });

  it("extracts paragraph text from a real DOCX via mammoth", async () => {
    const extractor = new MammothDocxTextExtractor();
    const result = await extractor.extract(
      buildMinimalDocx(["First paragraph", "Second paragraph"]),
    );
    expect(result.status).toBe("OK");
    expect(result.text).toContain("First paragraph");
    expect(result.text).toContain("Second paragraph");
    expect(result.text.indexOf("First paragraph")).toBeLessThan(
      result.text.indexOf("Second paragraph"),
    );
  });
});

describe("LegalAiDocumentExtractorService", () => {
  it("OCRs JPG, JPEG, PNG, and WEBP to OK without inventing text", async () => {
    const ocr = ocrOk("Recognized caption");
    const extractor = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: 1 }) },
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: null }) },
      ocr,
      noPdfImages(),
    );
    for (const format of ["jpeg", "png", "webp"] as const) {
      const result = await extractor.extract({
        format,
        body: new Uint8Array([1, 2, 3, 4]),
      });
      expect(result).toEqual({
        status: "OK",
        text: "Recognized caption",
        pageCount: null,
      });
    }
    expect(ocr.recognize).toHaveBeenCalledTimes(3);
  });

  it("maps empty native PDF text with no embeddable images to NEEDS_OCR", async () => {
    const ocr = ocrOk("should-not-run");
    const extractor = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "EMPTY", text: "", pageCount: 2 }) },
      { extract: async () => ({ status: "OK", text: "docx", pageCount: null }) },
      ocr,
      noPdfImages(),
    );
    const result = await extractor.extract({
      format: "pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    expect(result.status).toBe("NEEDS_OCR");
    expect(result.text).toBe("");
    expect(result.pageCount).toBe(2);
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it("OCRs scanned PDF page images in page order", async () => {
    const ocr: OcrEngine = {
      recognize: vi.fn(async ({ bytes }) => ({
        status: "OK" as const,
        text: bytes[0] === 1 ? "Page one clause" : "Page two clause",
        confidence: 90,
      })),
    };
    const extractor = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "EMPTY", text: "", pageCount: 2 }) },
      { extract: async () => ({ status: "OK", text: "docx", pageCount: null }) },
      ocr,
      {
        extract: async () => ({
          pageCount: 2,
          images: [
            { pageNumber: 1, bytes: new Uint8Array([1]) },
            { pageNumber: 2, bytes: new Uint8Array([2]) },
          ],
        }),
      },
    );
    const result = await extractor.extract({
      format: "pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    expect(result.status).toBe("OK");
    expect(result.text).toContain("--- Page 1 ---");
    expect(result.text).toContain("Page one clause");
    expect(result.text).toContain("--- Page 2 ---");
    expect(result.text).toContain("Page two clause");
    expect(result.text.indexOf("Page one clause")).toBeLessThan(
      result.text.indexOf("Page two clause"),
    );
  });

  it("returns EMPTY when OCR finds no text", async () => {
    const extractor = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "OK", text: "pdf", pageCount: 1 }) },
      { extract: async () => ({ status: "OK", text: "docx", pageCount: null }) },
      {
        recognize: async () => ({ status: "EMPTY", text: "", confidence: 12 }),
      },
      noPdfImages(),
    );
    const result = await extractor.extract({
      format: "png",
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    expect(result).toEqual({ status: "EMPTY", text: "", pageCount: null });
  });

  it("returns FAILED on OCR engine failure and timeout", async () => {
    const failed = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "OK", text: "pdf", pageCount: 1 }) },
      { extract: async () => ({ status: "OK", text: "docx", pageCount: null }) },
      {
        recognize: async () => ({ status: "FAILED", text: "", confidence: null }),
      },
      noPdfImages(),
    );
    expect(
      await failed.extract({ format: "jpeg", body: new Uint8Array([0xff, 0xd8, 0xff]) }),
    ).toEqual({ status: "FAILED", text: "", pageCount: null });

    const timedOut = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "OK", text: "pdf", pageCount: 1 }) },
      { extract: async () => ({ status: "OK", text: "docx", pageCount: null }) },
      {
        recognize: async () => ({
          status: "FAILED",
          text: "",
          confidence: null,
          timedOut: true,
        }),
      },
      noPdfImages(),
    );
    const timeoutResult = await timedOut.extract({
      format: "webp",
      body: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    });
    expect(timeoutResult.status).toBe("FAILED");
    expect(timeoutResult.timedOut).toBe(true);
    expect(timeoutResult.text).toBe("");
  });

  it("keeps native PDF OK extracts without calling OCR", async () => {
    const ocr = ocrOk("should-not-run");
    const extractor = new LegalAiDocumentExtractorService(
      {
        extract: async () => ({
          status: "OK",
          text: "Clause 1",
          pageCount: 1,
        }),
      },
      { extract: async () => ({ status: "OK", text: "docx", pageCount: null }) },
      ocr,
      noPdfImages(),
    );
    const result = await extractor.extract({
      format: "pdf",
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    expect(result).toEqual({ status: "OK", text: "Clause 1", pageCount: 1 });
    expect(ocr.recognize).not.toHaveBeenCalled();
  });
});
