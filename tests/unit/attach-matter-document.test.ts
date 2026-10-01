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
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
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
    ).rejects.toBeInstanceOf(ValidationError);
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
    ).rejects.toBeInstanceOf(ValidationError);
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
    ).rejects.toThrow("db write failed");
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
});
