import { describe, expect, it, vi } from "vitest";

import { LEGAL_AI_DOCUMENT_MAX_BYTES } from "@/application/ai/legal-ai-document.constants";
import { attachConversationPdfUseCase } from "@/application/use-cases/ai/attach-conversation-pdf";
import { UserRole, LegalQuestionStatus } from "@/domain/enums";
import { ConflictError, ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { LegalAiStore } from "@/application/ai/legal-ai.types";
import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { assertCanAccessStoredFile } from "@/application/services/assert-can-access-stored-file";
import type { PdfTextExtractor } from "@/infrastructure/ai/pdf-text-extractor";

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
    async findOwnedDocumentExtract() {
      return null;
    },
    async findOwnedDocumentMeta() {
      return null;
    },
    async findDocumentByStorageKey(storageKey) {
      for (const row of documents.values()) {
        if (row.storageKey === storageKey) return { userId: row.userId };
      }
      return null;
    },
    async findDocumentIdByConversationId(conversationId) {
      return documents.has(conversationId) ? "existing" : null;
    },
    async createConversationDocument(input) {
      documents.set(input.conversationId, {
        userId: input.userId,
        storageKey: input.storageKey,
      });
      return {
        id: "doc-1",
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractStatus: "OK",
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

function okExtractor(): PdfTextExtractor {
  return {
    async extract() {
      return { status: "OK", text: "Extracted clause", pageCount: 1 };
    },
  };
}

describe("attachConversationPdfUseCase", () => {
  it("stores an opaque key and returns safe metadata only", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const result = await attachConversationPdfUseCase(
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
      attachConversationPdfUseCase(
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

  it("does not store or persist EMPTY extracts and does not call a completion port", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    const extract = vi.fn(async () => ({
      status: "EMPTY" as const,
      text: "",
      pageCount: 1,
    }));
    await expect(
      attachConversationPdfUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "scan.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("ignored"),
        },
        { store, fileStorage, extractor: { extract } },
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/уншигдах текст олдсонгүй/),
    });
    expect(fileStorage.keys).toEqual([]);
    expect(store.documents.size).toBe(0);
  });

  it("rejects a second PDF on the same conversation without uploading", async () => {
    const store = createStore();
    store.documents.set("conv-owner", {
      userId: "lawyer-1",
      storageKey: "legal-ai-document/lawyer-1/existing.pdf",
    });
    const fileStorage = createStorage();
    await expect(
      attachConversationPdfUseCase(
        {
          userId: "lawyer-1",
          conversationId: "conv-owner",
          fileName: "second.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("second"),
        },
        { store, fileStorage, extractor: okExtractor() },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(fileStorage.keys).toEqual([]);
  });

  it("returns 404 for another user's conversation", async () => {
    const store = createStore();
    const fileStorage = createStorage();
    await expect(
      attachConversationPdfUseCase(
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
      attachConversationPdfUseCase(
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
