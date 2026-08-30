import { describe, expect, it } from "vitest";

import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import {
  assertValidLegalAiDocumentUpload,
  detectLegalAiDocumentFormat,
} from "@/application/ai/document-upload-validation";
import { clientRejectLegalAiDocument } from "@/application/ai/legal-ai-document-file";
import { ValidationError } from "@/domain/errors/domain-error";

import { buildMinimalPdf } from "./helpers/minimal-pdf";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("Legal AI document upload validation", () => {
  it("accepts PDF, DOCX, JPEG, PNG, and WEBP by magic bytes", () => {
    expect(
      assertValidLegalAiDocumentUpload({
        fileName: "a.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("ok"),
      }).format,
    ).toBe("pdf");
    expect(
      assertValidLegalAiDocumentUpload({
        fileName: "a.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: ZIP,
      }).format,
    ).toBe("docx");
    expect(
      assertValidLegalAiDocumentUpload({
        fileName: "a.jpg",
        contentType: "image/jpeg",
        body: JPEG,
      }).mimeType,
    ).toBe("image/jpeg");
    expect(
      assertValidLegalAiDocumentUpload({
        fileName: "a.png",
        contentType: "image/png",
        body: PNG,
      }).format,
    ).toBe("png");
    expect(
      assertValidLegalAiDocumentUpload({
        fileName: "a.webp",
        contentType: "image/webp",
        body: WEBP,
      }).format,
    ).toBe("webp");
  });

  it("rejects legacy .doc with a clear message", () => {
    expect(() =>
      assertValidLegalAiDocumentUpload({
        fileName: "old.doc",
        contentType: "application/msword",
        body: OLE,
      }),
    ).toThrow(/docx форматаар/);
    expect(detectLegalAiDocumentFormat(OLE)).toBe("doc");
    expect(clientRejectLegalAiDocument({ name: "old.doc", type: "application/msword", size: 12 })).toMatch(
      /docx/,
    );
  });

  it("rejects xlsx/zip that is not claimed as DOCX", () => {
    expect(() =>
      assertValidLegalAiDocumentUpload({
        fileName: "sheet.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: ZIP,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects files larger than the existing 10MB cap", () => {
    const body = new Uint8Array(LEGAL_AI_DOCUMENT_MAX_BYTES + 1);
    body.set([0x25, 0x50, 0x44, 0x46]);
    expect(() =>
      assertValidLegalAiDocumentUpload({
        fileName: "huge.pdf",
        contentType: "application/pdf",
        body,
      }),
    ).toThrow(/10MB/);
  });

  it("rejects MIME/magic mismatch", () => {
    expect(() =>
      assertValidLegalAiDocumentUpload({
        fileName: "fake.png",
        contentType: "image/png",
        body: buildMinimalPdf("not-png"),
      }),
    ).toThrow(ValidationError);
  });

  it("does not let a .pdf extension turn a ZIP into a PDF", () => {
    expect(() =>
      assertValidLegalAiDocumentUpload({
        fileName: "payload.pdf",
        contentType: "application/pdf",
        body: ZIP,
      }),
    ).toThrow(ValidationError);
  });

  it("does not let a .docx extension turn a PDF into a DOCX", () => {
    expect(() =>
      assertValidLegalAiDocumentUpload({
        fileName: "payload.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: buildMinimalPdf("not-docx"),
      }),
    ).toThrow(ValidationError);
  });

  it("rejects unsupported extensions even with a DOCX MIME type", () => {
    expect(() =>
      assertValidLegalAiDocumentUpload({
        fileName: "notes.txt",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: new TextEncoder().encode("plain text"),
      }),
    ).toThrow(ValidationError);
  });
});
