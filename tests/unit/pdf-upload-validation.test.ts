import { describe, expect, it } from "vitest";

import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import {
  assertValidPdfUpload,
  hasPdfMagicBytes,
} from "@/application/ai/pdf-upload-validation";
import { ValidationError } from "@/domain/errors/domain-error";

import { buildMinimalPdf } from "./helpers/minimal-pdf";

describe("PDF upload validation", () => {
  it("accepts a PDF whose bytes begin with %PDF", () => {
    const body = buildMinimalPdf("Contract clause");
    expect(hasPdfMagicBytes(body)).toBe(true);
    expect(() =>
      assertValidPdfUpload({
        fileName: "contract.pdf",
        contentType: "application/pdf",
        body,
      }),
    ).not.toThrow();
  });

  it("rejects application/pdf that is not a PDF", () => {
    expect(() =>
      assertValidPdfUpload({
        fileName: "fake.pdf",
        contentType: "application/pdf",
        body: new TextEncoder().encode("this is not a pdf"),
      }),
    ).toThrow(ValidationError);
  });

  it("rejects a malformed header even when MIME says PDF", () => {
    expect(() =>
      assertValidPdfUpload({
        fileName: "bad.pdf",
        contentType: "application/pdf",
        body: new TextEncoder().encode("%PDX-1.4"),
      }),
    ).toThrow(/PDF биш/);
  });

  it("rejects files larger than 10MB", () => {
    const body = new Uint8Array(LEGAL_AI_DOCUMENT_MAX_BYTES + 1);
    body.set([0x25, 0x50, 0x44, 0x46]);
    expect(() =>
      assertValidPdfUpload({
        fileName: "huge.pdf",
        contentType: "application/pdf",
        body,
      }),
    ).toThrow(/10MB/);
  });

  it("rejects DOCX MIME regardless of filename", () => {
    expect(() =>
      assertValidPdfUpload({
        fileName: "brief.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      }),
    ).toThrow(/Зөвхөн PDF/);
  });

  it("rejects images", () => {
    expect(() =>
      assertValidPdfUpload({
        fileName: "scan.png",
        contentType: "image/png",
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      }),
    ).toThrow(/Зөвхөн PDF/);
  });
});
