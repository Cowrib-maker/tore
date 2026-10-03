import { describe, expect, it, vi } from "vitest";

import { attachMatterDocumentUseCase } from "@/application/use-cases/matters/attach-matter-document";
import type {
  CreateMatterDocumentInput,
  MatterDocument,
} from "@/domain/entities/matter-document";
import type {
  CreateMatterInput,
  Matter,
} from "@/domain/entities/matter";
import type { MatterDocumentRepository } from "@/domain/repositories/matter-document-repository";
import type {
  MatterRepository,
  UpdateMatterPatch,
} from "@/domain/repositories/matter-repository";
import { UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import { DocumentUploadError } from "@/domain/errors/document-upload-errors";
import { MATTER_DOCUMENT_MAX_BYTES } from "@/application/use-cases/matters/matter-document-policy";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { LegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";

import { buildMinimalPdf } from "./helpers/minimal-pdf";

const owner = { userId: "user-1", role: UserRole.CLIENT };
const attacker = { userId: "user-2", role: UserRole.CLIENT };

function fakeMatterRepository(seed: Matter[]): MatterRepository {
  const rows = new Map(seed.map((matter) => [matter.id, matter]));
  return {
    async create(input: CreateMatterInput) {
      const matter: Matter = {
        id: "matter-new",
        ownerId: input.ownerId,
        title: input.title,
        type: input.type,
        description: input.description,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.set(matter.id, matter);
      return matter;
    },
    async findById(id: string) {
      return rows.get(id) ?? null;
    },
    async listByOwnerId(ownerId: string) {
      return [...rows.values()].filter((matter) => matter.ownerId === ownerId);
    },
    async update(id: string, patch: UpdateMatterPatch) {
      const existing = rows.get(id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, ...patch, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },
    async countConversationsByMatterIds(matterIds: string[]) {
      return Object.fromEntries(matterIds.map((id) => [id, 0]));
    },
  };
}

function fakeMatterDocumentRepository(): MatterDocumentRepository & {
  rows: Map<string, MatterDocument>;
} {
  const rows = new Map<string, MatterDocument>();
  let seq = 0;
  return {
    rows,
    async create(input: CreateMatterDocumentInput) {
      const document: MatterDocument = {
        id: `doc-${++seq}`,
        matterId: input.matterId,
        uploadedByUserId: input.uploadedByUserId,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractedText: input.extractedText,
        pageCount: input.pageCount,
        extractStatus: input.extractStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.set(document.id, document);
      return document;
    },
    async findById(id: string) {
      return rows.get(id) ?? null;
    },
    async listByMatterId(matterId: string) {
      return [...rows.values()].filter((doc) => doc.matterId === matterId);
    },
  };
}

function fakeStorage(): FileStorage & { keys: string[]; deleted: string[] } {
  const keys: string[] = [];
  const deleted: string[] = [];
  return {
    keys,
    deleted,
    async upload(input) {
      const key = `matter-document/${input.ownerId}/uuid-${input.fileName}`;
      keys.push(key);
      return {
        key,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        originalFileName: input.fileName,
      };
    },
    async delete(key) {
      deleted.push(key);
    },
    async getObject() {
      throw new Error("unused");
    },
    async getUrl() {
      return "/api/files/matter-document/x/y.pdf";
    },
  };
}

function okExtractor(): LegalAiDocumentExtractor {
  return {
    async extract() {
      return { status: "OK", text: "Extracted clause", pageCount: 1 };
    },
  };
}

function baseMatter(id: string, ownerId: string): Matter {
  return {
    id,
    ownerId,
    title: "Хэрэг",
    type: "GENERAL",
    description: null,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("attachMatterDocumentUseCase", () => {
  it("lets the owner upload a document to their own Matter", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const matterDocumentRepository = fakeMatterDocumentRepository();
    const fileStorage = fakeStorage();

    const result = await attachMatterDocumentUseCase(
      owner,
      {
        matterId: "matter-1",
        fileName: "contract.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("clause"),
      },
      { matterRepository, matterDocumentRepository, fileStorage, extractor: okExtractor() },
    );

    expect(result.extractStatus).toBe("OK");
    expect(result.matterId).toBe("matter-1");
    expect(matterDocumentRepository.rows.size).toBe(1);
    expect(fileStorage.keys[0]).toMatch(/^matter-document\/user-1\//);
  });

  it("refuses a non-owner with ForbiddenError and never touches storage", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const matterDocumentRepository = fakeMatterDocumentRepository();
    const fileStorage = fakeStorage();

    await expect(
      attachMatterDocumentUseCase(
        attacker,
        {
          matterId: "matter-1",
          fileName: "contract.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("clause"),
        },
        { matterRepository, matterDocumentRepository, fileStorage, extractor: okExtractor() },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(fileStorage.keys).toEqual([]);
    expect(matterDocumentRepository.rows.size).toBe(0);
  });

  it("refuses a nonexistent Matter with NotFoundError and never touches storage", async () => {
    const matterRepository = fakeMatterRepository([]);
    const matterDocumentRepository = fakeMatterDocumentRepository();
    const fileStorage = fakeStorage();

    await expect(
      attachMatterDocumentUseCase(
        owner,
        {
          matterId: "matter-does-not-exist",
          fileName: "contract.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("clause"),
        },
        { matterRepository, matterDocumentRepository, fileStorage, extractor: okExtractor() },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(fileStorage.keys).toEqual([]);
    expect(matterDocumentRepository.rows.size).toBe(0);
  });

  it("does not create a MatterDocument when extraction FAILED, and authorization runs before extraction", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const matterDocumentRepository = fakeMatterDocumentRepository();
    const fileStorage = fakeStorage();
    const extract = vi.fn(async () => ({ status: "FAILED" as const, text: "", pageCount: null }));

    await expect(
      attachMatterDocumentUseCase(
        owner,
        {
          matterId: "matter-1",
          fileName: "broken.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("ignored"),
        },
        { matterRepository, matterDocumentRepository, fileStorage, extractor: { extract } },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_FAILED" });
    expect(fileStorage.keys).toEqual([]);
    expect(matterDocumentRepository.rows.size).toBe(0);

    // Authorization still runs before the (never-reachable-here) attacker case.
    await expect(
      attachMatterDocumentUseCase(
        attacker,
        {
          matterId: "matter-1",
          fileName: "broken.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("ignored"),
        },
        { matterRepository, matterDocumentRepository, fileStorage, extractor: { extract } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(extract).toHaveBeenCalledTimes(1); // only for the owner's attempt above
  });

  it("does not create a MatterDocument when extraction is EMPTY", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const matterDocumentRepository = fakeMatterDocumentRepository();
    const fileStorage = fakeStorage();

    await expect(
      attachMatterDocumentUseCase(
        owner,
        {
          matterId: "matter-1",
          fileName: "empty.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("ignored"),
        },
        {
          matterRepository,
          matterDocumentRepository,
          fileStorage,
          extractor: { async extract() { return { status: "EMPTY", text: "", pageCount: null }; } },
        },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_FAILED" });
    expect(fileStorage.keys).toEqual([]);
    expect(matterDocumentRepository.rows.size).toBe(0);
  });

  it("deletes the uploaded blob when persistence fails after a successful upload", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const fileStorage = fakeStorage();
    const failingRepository: MatterDocumentRepository = {
      async create() {
        throw new Error("db write failed");
      },
      async findById() {
        return null;
      },
      async listByMatterId() {
        return [];
      },
    };

    await expect(
      attachMatterDocumentUseCase(
        owner,
        {
          matterId: "matter-1",
          fileName: "contract.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("clause"),
        },
        {
          matterRepository,
          matterDocumentRepository: failingRepository,
          fileStorage,
          extractor: okExtractor(),
        },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_SAVE_FAILED" });
    expect(fileStorage.keys).toHaveLength(1);
    expect(fileStorage.deleted).toEqual(fileStorage.keys);
  });

  it("scopes a document to exactly the Matter it was uploaded to, never another Matter", async () => {
    const matterRepository = fakeMatterRepository([
      baseMatter("matter-1", owner.userId),
      baseMatter("matter-2", owner.userId),
    ]);
    const matterDocumentRepository = fakeMatterDocumentRepository();
    const fileStorage = fakeStorage();

    await attachMatterDocumentUseCase(
      owner,
      {
        matterId: "matter-1",
        fileName: "a.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("a"),
      },
      { matterRepository, matterDocumentRepository, fileStorage, extractor: okExtractor() },
    );
    await attachMatterDocumentUseCase(
      owner,
      {
        matterId: "matter-2",
        fileName: "b.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("b"),
      },
      { matterRepository, matterDocumentRepository, fileStorage, extractor: okExtractor() },
    );

    const matter1Docs = await matterDocumentRepository.listByMatterId("matter-1");
    const matter2Docs = await matterDocumentRepository.listByMatterId("matter-2");
    expect(matter1Docs).toHaveLength(1);
    expect(matter1Docs[0]!.fileName).toBe("a.pdf");
    expect(matter2Docs).toHaveLength(1);
    expect(matter2Docs[0]!.fileName).toBe("b.pdf");
  });

  describe("pilot upload contract", () => {
    function setup(extractor: LegalAiDocumentExtractor = okExtractor(), storage = fakeStorage()) {
      const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
      const matterDocumentRepository = fakeMatterDocumentRepository();
      return {
        matterDocumentRepository,
        fileStorage: storage,
        deps: { matterRepository, matterDocumentRepository, fileStorage: storage, extractor },
      };
    }
    const textBody = new TextEncoder().encode("Гэрээний нөхцөл 1. Талууд харилцан тохиролцов.");
    const textInput = {
      matterId: "matter-1",
      fileName: "note.txt",
      contentType: "text/plain",
      body: textBody,
    };

    it("rejects a file over the pilot limit with FILE_TOO_LARGE before extraction or storage", async () => {
      const extract = vi.fn(async () => ({ status: "OK" as const, text: "x", pageCount: 1 }));
      const { deps, fileStorage, matterDocumentRepository } = setup({ extract });
      const body = new Uint8Array(MATTER_DOCUMENT_MAX_BYTES + 1);
      body.set([0x25, 0x50, 0x44, 0x46]);

      await expect(
        attachMatterDocumentUseCase(owner, { ...textInput, fileName: "big.pdf", contentType: "application/pdf", body }, deps),
      ).rejects.toMatchObject({ code: "FILE_TOO_LARGE", statusCode: 413 });
      expect(extract).not.toHaveBeenCalled();
      expect(fileStorage.keys).toEqual([]);
      expect(matterDocumentRepository.rows.size).toBe(0);
    });

    it("rejects an unsupported file type with UNSUPPORTED_FILE_TYPE", async () => {
      const { deps, fileStorage } = setup();
      await expect(
        attachMatterDocumentUseCase(
          owner,
          { ...textInput, fileName: "tool.exe", contentType: "application/octet-stream", body: new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0x02]) },
          deps,
        ),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
      expect(fileStorage.keys).toEqual([]);
    });

    it("accepts a valid text document and calls the extractor with OCR disabled", async () => {
      const extract = vi.fn(async () => ({ status: "OK" as const, text: "Гэрээний нөхцөл", pageCount: null }));
      const { deps, matterDocumentRepository } = setup({ extract });
      const result = await attachMatterDocumentUseCase(owner, textInput, deps);
      expect(result.extractStatus).toBe("OK");
      expect(matterDocumentRepository.rows.size).toBe(1);
      expect(extract).toHaveBeenCalledWith(expect.objectContaining({ format: "txt", allowOcr: false }));
    });

    it("rejects an image with OCR_UNSUPPORTED without extracting or storing", async () => {
      const extract = vi.fn();
      const { deps, fileStorage } = setup({ extract } as never);
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      await expect(
        attachMatterDocumentUseCase(owner, { ...textInput, fileName: "scan.png", contentType: "image/png", body: png }, deps),
      ).rejects.toMatchObject({ code: "OCR_UNSUPPORTED" });
      expect(extract).not.toHaveBeenCalled();
      expect(fileStorage.keys).toEqual([]);
    });

    it("rejects a scanned PDF (extractor NEEDS_OCR) with OCR_UNSUPPORTED and stores nothing", async () => {
      const { deps, fileStorage, matterDocumentRepository } = setup({
        async extract() { return { status: "NEEDS_OCR", text: "", pageCount: 3 }; },
      });
      await expect(
        attachMatterDocumentUseCase(
          owner,
          { matterId: "matter-1", fileName: "scan.pdf", contentType: "application/pdf", body: buildMinimalPdf("x") },
          deps,
        ),
      ).rejects.toMatchObject({ code: "OCR_UNSUPPORTED" });
      expect(fileStorage.keys).toEqual([]);
      expect(matterDocumentRepository.rows.size).toBe(0);
    });

    it("fails with DOCUMENT_PROCESSING_TIMEOUT when extraction hangs, without storing", async () => {
      const { deps, fileStorage, matterDocumentRepository } = setup({
        extract: () => new Promise(() => undefined),
      });
      await expect(
        attachMatterDocumentUseCase(owner, textInput, { ...deps, processingTimeoutMs: 20 }),
      ).rejects.toMatchObject({ code: "DOCUMENT_PROCESSING_TIMEOUT" });
      expect(fileStorage.keys).toEqual([]);
      expect(matterDocumentRepository.rows.size).toBe(0);
    });

    it("maps an extractor crash to DOCUMENT_EXTRACTION_FAILED with no stack in the message", async () => {
      const { deps } = setup({
        async extract() { throw new Error("Worker crashed at C:/secret/path"); },
      });
      const error = await attachMatterDocumentUseCase(owner, textInput, deps).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DocumentUploadError);
      expect((error as DocumentUploadError).code).toBe("DOCUMENT_EXTRACTION_FAILED");
      expect((error as DocumentUploadError).message).not.toContain("secret");
    });

    it("maps a storage failure to STORAGE_FAILED and persists no DB row", async () => {
      const storage = fakeStorage();
      storage.upload = async () => { throw new Error("S3 AccessDenied bucket=prod"); };
      const { deps, matterDocumentRepository } = setup(okExtractor(), storage);
      const error = await attachMatterDocumentUseCase(owner, textInput, deps).catch((e: unknown) => e);
      expect(error).toMatchObject({ code: "STORAGE_FAILED" });
      expect((error as Error).message).not.toContain("bucket");
      expect(matterDocumentRepository.rows.size).toBe(0);
    });

    it("still reports DOCUMENT_SAVE_FAILED when orphan cleanup itself fails", async () => {
      const storage = fakeStorage();
      storage.delete = async () => { throw new Error("delete failed"); };
      const { deps } = setup(okExtractor(), storage);
      deps.matterDocumentRepository.create = async () => { throw new Error("db down"); };
      await expect(attachMatterDocumentUseCase(owner, textInput, deps)).rejects.toMatchObject({
        code: "DOCUMENT_SAVE_FAILED",
      });
    });
  });
});
