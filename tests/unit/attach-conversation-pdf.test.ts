import { describe, expect, it, vi } from "vitest";

import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import { attachConversationDocumentUseCase } from "@/application/use-cases/ai/attach-conversation-document";
import { UserRole, LegalQuestionStatus } from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { LegalAiStore } from "@/application/ai/legal-ai.types";
import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { assertCanAccessStoredFile } from "@/application/services/assert-can-access-stored-file";
import type { LegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";

import { buildMinimalPdf } from "./helpers/minimal-pdf";

function createStore(): LegalAiStore & {
  documents: Map<string, { userId: string; storageKey: string }>;
  uploaded: string[];
} {
  const conversations = new Map<string, { id: string; userId: string }>([
    ["conv-owner", { id: "conv-owner", userId: "lawyer-1" }],
    ["conv-other", { id: "conv-other", userId: "lawyer-2" }],
  ]);
  const documents = new Map<string, { userId: string; storageKey: string }>();

  return {
  documents,
  uploaded: [],

  async countUserLegalAiQuestions(_userId) {
    return 0;
  },

  async findOwnedConversation(id, userId) {
    const row = conversations.get(id);
    if (!row || row.userId !== userId) return null;
    return { id: row.id, questionStatus: LegalQuestionStatus.NEW, billedQuestionCount: 0 };
  },
    async findAccessibleConversation(input) {
      const row = conversations.get(input.id);
      if (!row) return null;
      if (input.userId && row.userId === input.userId) {
        return { id: row.id, questionStatus: LegalQuestionStatus.NEW, billedQuestionCount: 0 };
      }
      return null;
    },
    async createConversation(input) {
      const id = `conv-${input.userId}-new`;
      conversations.set(id, { id, userId: input.userId ?? "unknown" });
      return { id, questionStatus: LegalQuestionStatus.NEW, billedQuestionCount: 0 };
    },
    async listOwnedCaseConversations() {
      return [];
    },
    async listOwnedRecentConversations() {
      return [];
    },
    async updateQuestionThread() {},
    async countBilledQuestionsForUser() {
      return 0;
    },
    async createUserMessage() {},
    async listMessages() {
      return [];
    },
    async createAssistantMessage() {
      return { id: "asst", role: "ASSISTANT", content: "" };
    },
    async recordUsage() {},
    async createCitations() {
      return [];
    },
    async listOwnedDocumentExtracts() {
      return [];
    },
    async listOwnedDocumentMetas() {
      return [];
    },
    async findDocumentByStorageKey(storageKey) {
      for (const row of documents.values()) {
        if (row.storageKey === storageKey) return { userId: row.userId };
      }
      return null;
    },
    async createConversationDocument(input) {
      documents.set(`${input.conversationId}:${input.storageKey}`, {
        userId: input.userId,
        storageKey: input.storageKey,
      });
      return {
        id: "doc-1",
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractStatus: input.extractStatus,
        pageCount: input.pageCount,
      };
    },
  };
}

function createStorage(): FileStorage & { keys: string[]; deleted: string[] } {
  const keys: string[] = [];
  const deleted: string[] = [];
  return {
    keys,
    deleted,
    async upload(input) {
      const key = `legal-ai-document/${input.ownerId}/uuid-${input.fileName}`;
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
      return "/api/files/legal-ai-document/x/y.pdf";
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

describe("attachConversationDocumentUseCase", () => {
  it("stores an opaque key and returns safe metadata only", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const result = await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "contract.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("clause"),
      },
      { store, fileStorage, extractor: okExtractor() },
    );

    expect(result).toEqual({
      id: "doc-1",
      conversationId: "conv-owner",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: expect.any(Number),
      extractStatus: "OK",
      pageCount: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(/legal-ai-document\/|C:\\|\/home\/|AKIA|secret/i);
    expect(fileStorage.keys[0]).toMatch(/^legal-ai-document\/lawyer-1\//);
    expect(fileStorage.keys[0]).not.toMatch(/C:\\|\.\./);
  });

  it("does not store invalid files", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "fake.pdf",
          contentType: "application/pdf",
          body: new TextEncoder().encode("not-a-pdf"),
        },
        { store, fileStorage, extractor: okExtractor() },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fileStorage.keys).toEqual([]);
    expect(store.documents.size).toBe(0);
  });

  it("persists empty/scanned PDFs as NEEDS_OCR, not OK", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const extract = vi.fn(async () => ({
      status: "NEEDS_OCR" as const,
      text: "",
      pageCount: 1,
    }));
    const result = await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "scan.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("ignored"),
      },
      { store, fileStorage, extractor: { extract } },
    );
    expect(result.extractStatus).toBe("NEEDS_OCR");
    expect(result.extractStatus).not.toBe("OK");
    expect(fileStorage.keys).toHaveLength(1);
    expect(store.documents.size).toBe(1);
  });

  it("does not store empty DOCX extracts as successful", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const extract = vi.fn(async () => ({
      status: "EMPTY" as const,
      text: "",
      pageCount: null,
    }));
    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "empty.docx",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        },
        { store, fileStorage, extractor: { extract } },
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/уншигдах текст олдсонгүй/),
    });
    expect(fileStorage.keys).toEqual([]);
    expect(store.documents.size).toBe(0);
  });

  it("does not store FAILED extracts", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const extract = vi.fn(async () => ({
      status: "FAILED" as const,
      text: "",
      pageCount: null,
    }));
    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "broken.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("ignored"),
        },
        { store, fileStorage, extractor: { extract } },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fileStorage.keys).toEqual([]);
    expect(store.documents.size).toBe(0);
  });

  it("persists NEEDS_OCR images without treating them as successful extracts", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "scan.png",
        contentType: "image/png",
        body: png,
      },
      {
        store,
        fileStorage,
        extractor: {
          async extract() {
            return { status: "NEEDS_OCR", text: "", pageCount: null };
          },
        },
      },
    );
    expect(result.extractStatus).toBe("NEEDS_OCR");
    expect(result.mimeType).toBe("image/png");
    expect(fileStorage.keys).toHaveLength(1);
    expect(store.documents.size).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/legal-ai-document\/|AKIA|secret/i);
  });

  it("persists successful OCR for JPG, JPEG, PNG, and WEBP as OK", async () => {
    const files = [
      {
        fileName: "scan.jpg",
        contentType: "image/jpeg",
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      },
      {
        fileName: "scan.jpeg",
        contentType: "image/jpeg",
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      },
      {
        fileName: "scan.png",
        contentType: "image/png",
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
      {
        fileName: "scan.webp",
        contentType: "image/webp",
        body: new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        ]),
      },
    ];
    const store = createStore();
    const fileStorage = createStorage();
    for (const file of files) {
      const result = await attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          ...file,
        },
        {
          store,
          fileStorage,
          extractor: {
            async extract() {
              return { status: "OK", text: "OCR clause from image", pageCount: null };
            },
          },
        },
      );
      expect(result.extractStatus).toBe("OK");
      expect(JSON.stringify(result)).not.toMatch(/legal-ai-document\/|storageKey/i);
    }
    expect(store.documents.size).toBe(files.length);
  });

  it("persists successful scanned-PDF OCR as OK", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const result = await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "scan.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf(""),
      },
      {
        store,
        fileStorage,
        extractor: {
          async extract() {
            return {
              status: "OK",
              text: "--- Page 1 ---\nScanned clause",
              pageCount: 1,
            };
          },
        },
      },
    );
    expect(result.extractStatus).toBe("OK");
    expect(store.documents.size).toBe(1);
  });

  it("does not store empty or failed OCR results", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "blank.png",
          contentType: "image/png",
          body: png,
        },
        {
          store,
          fileStorage,
          extractor: {
            async extract() {
              return { status: "EMPTY", text: "", pageCount: null };
            },
          },
        },
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/OCR-оос/) });
    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "bad.png",
          contentType: "image/png",
          body: png,
        },
        {
          store,
          fileStorage,
          extractor: {
            async extract() {
              return { status: "FAILED", text: "", pageCount: null, timedOut: true };
            },
          },
        },
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/хугацаа хэтэрлээ/) });
    expect(fileStorage.keys).toEqual([]);
    expect(store.documents.size).toBe(0);
  });

  it("allows multiple documents on the same conversation", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "first.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("first"),
      },
      { store, fileStorage, extractor: okExtractor() },
    );
    const second = await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "second.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("second"),
      },
      { store, fileStorage, extractor: okExtractor() },
    );
    expect(second.extractStatus).toBe("OK");
    expect(fileStorage.keys).toHaveLength(2);
    expect(store.documents.size).toBe(2);
  });

  it("stores a successful DOCX extract and rejects malformed DOCX without persisting", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const ok = await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "brief.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: zip,
      },
      {
        store,
        fileStorage,
        extractor: {
          async extract() {
            return { status: "OK", text: "1. Numbered clause\n\nParagraph two.", pageCount: null };
          },
        },
      },
    );
    expect(ok.extractStatus).toBe("OK");
    expect(ok.mimeType).toContain("wordprocessingml");
    expect(JSON.stringify(ok)).not.toMatch(/legal-ai-document\/|storageKey|AKIA/i);

    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "broken.docx",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          body: zip,
        },
        {
          store,
          fileStorage,
          extractor: {
            async extract() {
              return { status: "FAILED", text: "should-not-save", pageCount: null };
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.documents.size).toBe(1);
  });

  it("allows mixed PDF, DOCX, and image attachments on one conversation", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "a.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("pdf"),
      },
      { store, fileStorage, extractor: okExtractor() },
    );
    await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "b.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: zip,
      },
      { store, fileStorage, extractor: okExtractor() },
    );
    const image = await attachConversationDocumentUseCase(
      {
        userId: "lawyer-1",
        conversationId: "conv-owner",
        fileName: "c.png",
        contentType: "image/png",
        body: png,
      },
      {
        store,
        fileStorage,
        extractor: {
          async extract() {
            return { status: "NEEDS_OCR", text: "fake-ocr", pageCount: null };
          },
        },
      },
    );
    expect(image.extractStatus).toBe("NEEDS_OCR");
    expect(fileStorage.keys).toHaveLength(3);
    expect(store.documents.size).toBe(3);
  });

  it("returns 404 for another user's conversation", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-other",
          fileName: "contract.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("clause"),
        },
        { store, fileStorage, extractor: okExtractor() },
      ),
    ).rejects.toMatchObject({
      message: "Яриа олдсонгүй.",
      statusCode: 404,
    } satisfies Partial<LegalAiError>);
    expect(fileStorage.keys).toEqual([]);
  });

  it("rejects oversized files before extraction or storage", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const extract = vi.fn();
    const body = new Uint8Array(LEGAL_AI_DOCUMENT_MAX_BYTES + 1);
    body.set([0x25, 0x50, 0x44, 0x46]);
    await expect(
      attachConversationDocumentUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "huge.pdf",
          contentType: "application/pdf",
          body,
        },
        { store, fileStorage, extractor: { extract } },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(extract).not.toHaveBeenCalled();
    expect(fileStorage.keys).toEqual([]);
  });
});

describe("legal-ai-document file ACL", () => {
  const key = "legal-ai-document/lawyer-1/uuid-contract.pdf";
  const deps = {
    lawyerProfileRepository: { findByUserId: vi.fn() },
    lawyerCredentialRepository: { findByLawyerProfileId: vi.fn() },
    findLegalAiDocumentByStorageKey: vi.fn(async (storageKey: string) =>
      storageKey === key ? { userId: "lawyer-1" } : null,
    ),
  };

  it("allows the owning lawyer", async () => {
    await expect(
      assertCanAccessStoredFile(
        { userId: "lawyer-1", role: UserRole.LAWYER },
        key,
        deps as never,
      ),
    ).resolves.toBeUndefined();
  });

  it("denies another lawyer", async () => {
    await expect(
      assertCanAccessStoredFile(
        { userId: "lawyer-2", role: UserRole.LAWYER },
        key,
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies clients", async () => {
    await expect(
      assertCanAccessStoredFile(
        { userId: "client-1", role: UserRole.CLIENT },
        key,
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows admins without a document row lookup", async () => {
    deps.findLegalAiDocumentByStorageKey.mockClear();
    await expect(
      assertCanAccessStoredFile(
        { userId: "admin-1", role: UserRole.ADMIN },
        key,
        deps as never,
      ),
    ).resolves.toBeUndefined();
    expect(deps.findLegalAiDocumentByStorageKey).not.toHaveBeenCalled();
  });
});
