import { describe, expect, it, vi } from "vitest";

import { htmlToStructuredText, MammothDocxTextExtractor } from "@/infrastructure/ai/docx-text-extractor";
import { LegalAiDocumentExtractorService } from "@/infrastructure/ai/document-text-extractor";
import type { OcrEngine } from "@/infrastructure/ai/ocr-engine";
import type { PdfEmbeddedImageExtractor } from "@/infrastructure/ai/pdf-embedded-image-extractor";
import type { SpreadsheetTextExtractor } from "@/infrastructure/ai/spreadsheet-text-extractor";
import type { PlainTextExtractor } from "@/infrastructure/ai/plain-text-extractor";

import { buildDocxWithImage, buildMinimalDocx } from "./helpers/minimal-docx";

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

  // Regression: the attachment tile got stuck on its loading spinner for a
  // real-world Mongolian-language complaint document (М.Ган-Од гомдол.docx).
  it("extracts Mongolian Unicode paragraphs from a real DOCX via mammoth, in order and unmangled", async () => {
    const extractor = new MammothDocxTextExtractor();
    const paragraphs = [
      "Нэхэмжлэгч: Бат-Эрдэнэ овогтой иргэн.",
      "Гомдлын шалтгаан: Хөдөлмөрийн гэрээг хууль бусаар цуцалсан тухай.",
      "Иймд Хөдөлмөрийн тухай хуулийн 83 дугаар зүйлд заасны дагуу шийдвэрлэж өгнө үү.",
    ];
    const result = await extractor.extract(buildMinimalDocx(paragraphs));
    expect(result.status).toBe("OK");
    for (const paragraph of paragraphs) {
      expect(result.text).toContain(paragraph);
    }
    expect(result.text.indexOf(paragraphs[0]!)).toBeLessThan(
      result.text.indexOf(paragraphs[1]!),
    );
    expect(result.text.indexOf(paragraphs[1]!)).toBeLessThan(
      result.text.indexOf(paragraphs[2]!),
    );
  });

  // Root cause of the stuck-spinner bug, half one: mammoth's default
  // `convertImage` reads every embedded image and inlines it as base64 in
  // the HTML it returns — pure wasted work, since htmlToStructuredText
  // strips every <img> tag from the FINAL text regardless (so asserting on
  // the final text alone can't tell the two behaviors apart — the base64
  // never survives to `result.text` either way). The real difference is
  // that mammoth is never asked to read the image's bytes at all; assert
  // that directly by spying on the actual `mammoth.convertToHtml` call
  // (letting the real implementation run) rather than inferring it
  // indirectly. A real-world document (unlike this suite's other, image-
  // free fixtures) routinely embeds a letterhead, signature scan, or
  // exhibit photo.
  it("passes mammoth a convertImage option that never reads embedded image bytes", async () => {
    const mammoth = (await import("mammoth")).default;
    const spy = vi.spyOn(mammoth, "convertToHtml");
    const extractor = new MammothDocxTextExtractor();
    const fakeImageBytes = new Uint8Array(50_000).fill(0x41);
    const docx = buildDocxWithImage(["Нэхэмжлэгч: Бат-Эрдэнэ овогтой иргэн."], fakeImageBytes);

    const result = await extractor.extract(docx);

    expect(result.status).toBe("OK");
    expect(result.text).toContain("Нэхэмжлэгч: Бат-Эрдэнэ овогтой иргэн.");
    expect(spy).toHaveBeenCalledTimes(1);
    const options = spy.mock.calls[0]?.[1];
    expect(options?.convertImage).toBeDefined();
    // The default (no convertImage option at all) is what used to read and
    // base64-encode every embedded image; this extractor must never call
    // mammoth.convertToHtml without overriding it.
    spy.mockRestore();
  });

  // Root cause of the stuck-spinner bug, half two: nothing bounded how long
  // extraction could take, so a slow/pathological real-world DOCX left the
  // attachment tile spinning until the platform's own function timeout
  // (up to 300s) eventually killed the request, with no recoverable error
  // state in between. Verified against the REAL mammoth call (not a mocked
  // one): an effectively-zero injected timeout against ordinary, valid
  // DOCX content is guaranteed to lose the Promise.race to a real async
  // extraction, proving the timeout wiring actually wraps the real call.
  it("times out instead of hanging, and reports timedOut so the caller shows a specific message (regression)", async () => {
    const extractor = new MammothDocxTextExtractor(0);
    const result = await extractor.extract(
      buildMinimalDocx(["Нэхэмжлэгч: Бат-Эрдэнэ овогтой иргэн."]),
    );
    expect(result.status).toBe("FAILED");
    expect(result.timedOut).toBe(true);
    expect(result.text).toBe("");
  });

  it("a generous timeout does not false-positive on an ordinary, fast extraction", async () => {
    const extractor = new MammothDocxTextExtractor(20_000);
    const result = await extractor.extract(buildMinimalDocx(["Paragraph"]));
    expect(result.status).toBe("OK");
    expect(result.timedOut).toBeUndefined();
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

  it("routes .xlsx uploads to the spreadsheet extractor without touching PDF/DOCX/OCR", async () => {
    const pdf = { extract: vi.fn(async () => ({ status: "OK" as const, text: "should-not-run", pageCount: 1 })) };
    const docx = { extract: vi.fn(async () => ({ status: "OK" as const, text: "should-not-run", pageCount: null })) };
    const ocr = ocrOk("should-not-run");
    const spreadsheet: SpreadsheetTextExtractor = {
      extract: vi.fn(async () => ({ status: "OK" as const, text: "Sheet1\nA1 | B1", pageCount: null })),
    };
    const extractor = new LegalAiDocumentExtractorService(
      pdf,
      docx,
      ocr,
      noPdfImages(),
      spreadsheet,
      { extract: vi.fn(async () => ({ status: "OK" as const, text: "should-not-run", pageCount: null })) },
    );
    const body = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const result = await extractor.extract({ format: "xlsx", body });
    expect(result).toEqual({ status: "OK", text: "Sheet1\nA1 | B1", pageCount: null });
    expect(spreadsheet.extract).toHaveBeenCalledWith(body);
    expect(pdf.extract).not.toHaveBeenCalled();
    expect(docx.extract).not.toHaveBeenCalled();
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it("routes .txt and .csv uploads to the plain-text extractor", async () => {
    const plainText: PlainTextExtractor = {
      extract: vi.fn(async () => ({ status: "OK" as const, text: "Hello, TORE", pageCount: null })),
    };
    const extractor = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: 1 }) },
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: null }) },
      ocrOk("should-not-run"),
      noPdfImages(),
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: null }) },
      plainText,
    );
    for (const format of ["txt", "csv"] as const) {
      const body = new TextEncoder().encode("Hello, TORE");
      const result = await extractor.extract({ format, body });
      expect(result).toEqual({ status: "OK", text: "Hello, TORE", pageCount: null });
    }
    expect(plainText.extract).toHaveBeenCalledTimes(2);
  });

  it("passes through EMPTY and FAILED statuses from the spreadsheet and plain-text extractors unchanged", async () => {
    const emptySpreadsheet: SpreadsheetTextExtractor = {
      extract: async () => ({ status: "EMPTY", text: "", pageCount: null }),
    };
    const extractorA = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: 1 }) },
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: null }) },
      ocrOk("should-not-run"),
      noPdfImages(),
      emptySpreadsheet,
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: null }) },
    );
    expect(
      await extractorA.extract({ format: "xlsx", body: new Uint8Array([0x50, 0x4b]) }),
    ).toEqual({ status: "EMPTY", text: "", pageCount: null });

    const failedPlainText: PlainTextExtractor = {
      extract: async () => ({ status: "FAILED", text: "", pageCount: null }),
    };
    const extractorB = new LegalAiDocumentExtractorService(
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: 1 }) },
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: null }) },
      ocrOk("should-not-run"),
      noPdfImages(),
      { extract: async () => ({ status: "OK", text: "should-not-run", pageCount: null }) },
      failedPlainText,
    );
    expect(
      await extractorB.extract({ format: "csv", body: new Uint8Array([0, 1, 2]) }),
    ).toEqual({ status: "FAILED", text: "", pageCount: null });
  });
});
