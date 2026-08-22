import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";
import { boundExtractedText, UnpdfTextExtractor } from "@/infrastructure/ai/pdf-text-extractor";

import { buildMinimalPdf, pdfMagicPrefix } from "./helpers/minimal-pdf";

describe("PDF text extractor", () => {
  const extractor = new UnpdfTextExtractor();

  it("extracts non-empty text and a page count from a digital PDF", async () => {
    const result = await extractor.extract(
      buildMinimalPdf("Native text clause 17.1"),
    );
    expect(result.status).toBe("OK");
    expect(result.text).toContain("Native text clause 17.1");
    expect(result.pageCount).toBe(1);
  });

  it("returns EMPTY for a valid PDF with no extractable text", async () => {
    const result = await extractor.extract(buildMinimalPdf(""));
    expect(result.status).toBe("EMPTY");
    expect(result.text).toBe("");
  });

  it("returns FAILED for a %PDF prefix that is not a parseable document", async () => {
    const result = await extractor.extract(pdfMagicPrefix("junk"));
    expect(result.status).toBe("FAILED");
    expect(result.text).toBe("");
    expect(result.pageCount).toBeNull();
  });

  it("does not import or call OpenAI", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/infrastructure/ai/pdf-text-extractor.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from ["']openai["']/);
    expect(source).not.toMatch(/new OpenAI/);
    expect(source).toContain("unpdf");
  });

  it("bounds extracted text by MAX_DOCUMENT_EXTRACT_CHARS", () => {
    const overflow = `prefix ${"x".repeat(MAX_DOCUMENT_EXTRACT_CHARS)}`;
    const bounded = boundExtractedText(overflow);
    expect(bounded.length).toBe(MAX_DOCUMENT_EXTRACT_CHARS);
    expect(bounded.startsWith("prefix")).toBe(true);
  });
});
