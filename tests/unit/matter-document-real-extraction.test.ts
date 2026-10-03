import { describe, expect, it, vi } from "vitest";

import {
  clientRejectMatterDocument,
  MATTER_DOCUMENT_MAX_BYTES,
} from "@/application/use-cases/matters/matter-document-policy";
import { attachMatterDocumentUseCase } from "@/application/use-cases/matters/attach-matter-document";
import { UserRole } from "@/domain/enums";
import { LegalAiDocumentExtractorService } from "@/infrastructure/ai/document-text-extractor";
import type { OcrEngine } from "@/infrastructure/ai/ocr-engine";

import { buildMinimalDocx } from "./helpers/minimal-docx";
import { buildMinimalPdf } from "./helpers/minimal-pdf";

const owner = { userId: "user-1", role: UserRole.CLIENT };

/** Real PDF/DOCX parsers; OCR engine must never be touched on this path. */
function realPipeline() {
  const recognize = vi.fn();
  const ocr: OcrEngine = { recognize };
  const extractor = new LegalAiDocumentExtractorService(
    undefined,
    undefined,
    ocr,
  );
  const created: unknown[] = [];
  const uploaded: string[] = [];
  const deps = {
    matterRepository: {
      async findById() {
        return {
          id: "m1",
          ownerId: owner.userId,
          title: "t",
          type: "GENERAL",
          description: null,
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as never,
    matterDocumentRepository: {
      async create(input: Record<string, unknown>) {
        created.push(input);
        return {
          id: "d1",
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as never,
    fileStorage: {
      async upload(input: { body: Uint8Array; fileName: string }) {
        uploaded.push(input.fileName);
        return {
          key: `matter-document/u/${input.fileName}`,
          contentType: "x",
          sizeBytes: input.body.byteLength,
          originalFileName: input.fileName,
        };
      },
      async delete() {},
    } as never,
    extractor,
  };
  return { deps, created, uploaded, recognize };
}

describe("Matter document upload with the real extractors", () => {
  it("accepts a text-based PDF", async () => {
    const { deps, created, uploaded, recognize } = realPipeline();
    const result = await attachMatterDocumentUseCase(
      owner,
      {
        matterId: "m1",
        fileName: "contract.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("Employment contract clause"),
      },
      deps,
    );
    expect(result.extractStatus).toBe("OK");
    expect(created).toHaveLength(1);
    expect(uploaded).toEqual(["contract.pdf"]);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("accepts a DOCX", async () => {
    const { deps, created, recognize } = realPipeline();
    const result = await attachMatterDocumentUseCase(
      owner,
      {
        matterId: "m1",
        fileName: "memo.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: buildMinimalDocx(["First paragraph", "Second paragraph"]),
      },
      deps,
    );
    expect(result.extractStatus).toBe("OK");
    expect(created).toHaveLength(1);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("rejects a PDF with no text layer as OCR_UNSUPPORTED, never starting OCR or storing", async () => {
    const { deps, created, uploaded, recognize } = realPipeline();
    await expect(
      attachMatterDocumentUseCase(
        owner,
        {
          matterId: "m1",
          fileName: "scan.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf(""),
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: "OCR_UNSUPPORTED" });
    expect(recognize).not.toHaveBeenCalled();
    expect(created).toEqual([]);
    expect(uploaded).toEqual([]);
  });
});

describe("clientRejectMatterDocument", () => {
  const pdf = { name: "a.pdf", type: "application/pdf", size: 1000 };

  it("accepts a normal PDF and a file exactly at the limit", () => {
    expect(clientRejectMatterDocument(pdf)).toBeNull();
    expect(
      clientRejectMatterDocument({ ...pdf, size: MATTER_DOCUMENT_MAX_BYTES }),
    ).toBeNull();
  });

  it("rejects a file over the pilot limit with the 4MB message", () => {
    expect(
      clientRejectMatterDocument({ ...pdf, size: MATTER_DOCUMENT_MAX_BYTES + 1 }),
    ).toContain("4MB");
  });

  it("rejects images (no OCR) and unsupported types", () => {
    expect(
      clientRejectMatterDocument({ name: "s.png", type: "image/png", size: 10 }),
    ).toContain("OCR");
    expect(
      clientRejectMatterDocument({ name: "x.exe", type: "", size: 10 }),
    ).toBeTruthy();
  });

  it("keeps the pilot limit under Vercel's 4.5 MB request body cap", () => {
    expect(MATTER_DOCUMENT_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});
