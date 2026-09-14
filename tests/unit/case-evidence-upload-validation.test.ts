import { describe, expect, it } from "vitest";

import { assertValidCaseEvidenceUpload } from "@/application/ai/case-evidence-upload-validation";
import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import { ValidationError } from "@/domain/errors/domain-error";
import { buildMinimalPdf } from "./helpers/minimal-pdf";

/**
 * Mobile camera/photo upload fix (TORE.MN production-readiness mission,
 * Phase 2). Case Review evidence upload was PDF-only (client accept
 * attribute AND server validator), which on a mobile OS file picker
 * hides the Camera/Photos options entirely for `accept="application/pdf"`
 * — a lawyer could not attach a phone photo of a document to a case at
 * all. This validator is the server-side half of the fix: PDF or a
 * photo (JPEG/PNG/WEBP), detected by magic bytes, same 10MB ceiling as
 * before. assertValidPdfUpload (pdf-upload-validation.ts) and its own
 * "rejects images" test are untouched — this is a separate, additive
 * validator, not a loosening of that one.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("assertValidCaseEvidenceUpload", () => {
  it("accepts a real PDF (backward-compatible with the pre-fix behavior)", () => {
    const result = assertValidCaseEvidenceUpload({
      fileName: "contract.pdf",
      contentType: "application/pdf",
      body: buildMinimalPdf("contract text"),
    });
    expect(result).toEqual({ format: "pdf", mimeType: "application/pdf", fileName: "contract.pdf" });
  });

  it("accepts a JPEG photo (the actual mobile-camera fix)", () => {
    const result = assertValidCaseEvidenceUpload({
      fileName: "photo.jpg",
      contentType: "image/jpeg",
      body: JPEG,
    });
    expect(result).toEqual({ format: "jpeg", mimeType: "image/jpeg", fileName: "photo.jpg" });
  });

  it("accepts a PNG photo", () => {
    const result = assertValidCaseEvidenceUpload({
      fileName: "scan.png",
      contentType: "image/png",
      body: PNG,
    });
    expect(result.format).toBe("png");
    expect(result.mimeType).toBe("image/png");
  });

  it("accepts a WEBP photo", () => {
    const result = assertValidCaseEvidenceUpload({
      fileName: "scan.webp",
      contentType: "image/webp",
      body: WEBP,
    });
    expect(result.format).toBe("webp");
    expect(result.mimeType).toBe("image/webp");
  });

  it("detects format from magic bytes, not the claimed contentType (a mislabeled real photo is still accepted)", () => {
    const result = assertValidCaseEvidenceUpload({
      fileName: "photo.jpg",
      contentType: "application/octet-stream",
      body: JPEG,
    });
    expect(result.format).toBe("jpeg");
  });

  it("rejects an empty body", () => {
    expect(() =>
      assertValidCaseEvidenceUpload({ fileName: "x", contentType: "application/pdf", body: new Uint8Array(0) }),
    ).toThrow(ValidationError);
  });

  it("rejects a body over the size ceiling", () => {
    const body = new Uint8Array(LEGAL_AI_DOCUMENT_MAX_BYTES + 1);
    body.set(JPEG);
    expect(() =>
      assertValidCaseEvidenceUpload({ fileName: "big.jpg", contentType: "image/jpeg", body }),
    ).toThrow(/10MB/);
  });

  it("rejects an out-of-scope format (docx) — still narrower than the full Legal AI attachment allowlist", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(() =>
      assertValidCaseEvidenceUpload({
        fileName: "brief.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: zip,
      }),
    ).toThrow(/PDF эсвэл зураг/);
  });

  it("rejects unrecognized binary content", () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe]);
    expect(() =>
      assertValidCaseEvidenceUpload({ fileName: "x.bin", contentType: "application/octet-stream", body: garbage }),
    ).toThrow(ValidationError);
  });
});
