import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
  UserStatus,
} from "@/domain/enums";
import type { LegalAiStore } from "@/application/ai/legal-ai.types";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { LegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";

/**
 * ADMIN LEGAL AI CHAT — document attachment.
 *
 * Root cause: src/app/api/ai/documents/route.ts required
 * `requireActor(UserRole.CLIENT)`, so ADMIN (unlike CLIENT) got a 403 before
 * ever reaching attachConversationDocumentUseCase, even though the shared
 * use-case, PrismaLegalAiStore ownership scoping, and rate limiting are all
 * already role-agnostic and userId-scoped.
 *
 * Fix: requireActor now accepts [UserRole.CLIENT, UserRole.ADMIN], and the
 * CLIENT-only citizen entitlement guard (assertCitizenAiOperation /
 * recordCitizenFeatureUsage) is only invoked when actor.role === CLIENT —
 * ADMIN skips it entirely rather than being forced through a subscription
 * check it can never satisfy.
 *
 * These tests exercise the REAL route handler end to end (only session
 * lookup, the Prisma-backed repositories, file storage, and the document
 * extractor are faked), matching the pattern established in
 * session-sync-route.test.ts.
 */

const lookupAuthSession = vi.fn();
const findById = vi.fn();
const findActiveSeatForUser = vi.fn();
const findActiveOwnedByUserId = vi.fn();
const getOrCreate = vi.fn();
const increment = vi.fn();

vi.mock("@/application/common/session", () => ({
  lookupAuthSession: (...args: unknown[]) => lookupAuthSession(...args),
  getSessionUser: vi.fn(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  userRepository: {
    findById: (...args: unknown[]) => findById(...args),
  },
  subscriptionRepository: {
    findActiveSeatForUser: (...args: unknown[]) =>
      findActiveSeatForUser(...args),
    findActiveOwnedByUserId: (...args: unknown[]) =>
      findActiveOwnedByUserId(...args),
  },
  entitlementUsageRepository: {
    getOrCreate: (...args: unknown[]) => getOrCreate(...args),
    increment: (...args: unknown[]) => increment(...args),
  },
}));

type StoredDoc = { conversationId: string; userId: string; storageKey: string };

function createFakeStore(
  conversations: Map<string, { id: string; userId: string }>,
): LegalAiStore & { documents: StoredDoc[]; uploadedKeys: string[] } {
  const documents: StoredDoc[] = [];
  return {
    documents,
    uploadedKeys: [],
    async countUserLegalAiQuestions() {
      return 0;
    },
    async findOwnedConversation(id, userId) {
      const row = conversations.get(id);
      if (!row || row.userId !== userId) return null;
      return { id: row.id, questionStatus: "NEW" as never, billedQuestionCount: 0 };
    },
    async findAccessibleConversation(input) {
      const row = conversations.get(input.id);
      if (!row) return null;
      if (input.userId && row.userId === input.userId) {
        return { id: row.id, questionStatus: "NEW" as never, billedQuestionCount: 0 };
      }
      return null;
    },
    async createConversation(input) {
      const id = `conv-${input.userId}-${conversations.size}`;
      conversations.set(id, { id, userId: input.userId ?? "unknown" });
      return { id, questionStatus: "NEW" as never, billedQuestionCount: 0 };
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
    async listOwnedDocumentExtracts(conversationId, userId) {
      return documents
        .filter((d) => d.conversationId === conversationId && d.userId === userId)
        .map((d) => ({
          fileName: "contract.pdf",
          extractedText: "Extracted clause",
          extractStatus: "OK" as never,
        }));
    },
    async listOwnedDocumentMetas() {
      return [];
    },
    async findDocumentByStorageKey(storageKey) {
      const row = documents.find((d) => d.storageKey === storageKey);
      return row ? { userId: row.userId } : null;
    },
    async createConversationDocument(input) {
      documents.push({
        conversationId: input.conversationId,
        userId: input.userId,
        storageKey: input.storageKey,
      });
      return {
        id: `doc-${documents.length}`,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractStatus: input.extractStatus,
        pageCount: input.pageCount,
      };
    },
  };
}

function createFakeStorage(): FileStorage {
  return {
    async upload(input) {
      return {
        key: `legal-ai-document/${input.ownerId}/uuid-${input.fileName}`,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        originalFileName: input.fileName,
      };
    },
    async delete() {},
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

let sharedConversations: Map<string, { id: string; userId: string }>;
let fakeStore: ReturnType<typeof createFakeStore>;

// The route module constructs `new PrismaLegalAiStore()` exactly once at
// module load (top-level `const store = ...`), and dynamic `import()` of an
// already-loaded module does not re-run that top-level code. A plain
// `mockImplementation(() => fakeStore)` would therefore freeze the route's
// `store` reference to whatever `fakeStore` was on the FIRST import, so
// later tests' fresh `fakeStore` (new conversations Map, empty documents)
// would silently never be reached. This proxy is constructed once too, but
// every method call reads the CURRENT `fakeStore` at call time instead of
// closing over one snapshot.
const storeProxy = new Proxy(
  {},
  {
    get(_target, prop: string) {
      return (...args: unknown[]) =>
        (fakeStore as unknown as Record<string, (...a: unknown[]) => unknown>)[
          prop
        ]!(...args);
    },
  },
);

vi.mock("@/infrastructure/ai/prisma-legal-ai-store", () => ({
  PrismaLegalAiStore: vi.fn().mockImplementation(() => storeProxy),
}));

vi.mock("@/infrastructure/storage", () => ({
  getFileStorage: () => createFakeStorage(),
}));

vi.mock("@/infrastructure/ai/document-text-extractor", () => ({
  getLegalAiDocumentExtractor: () => okExtractor(),
}));

function activeRecord(userId: string, role: UserRole, email = `${userId}@example.mn`) {
  return {
    id: userId,
    role,
    status: UserStatus.ACTIVE,
    email,
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function sessionFor(userId: string, role: UserRole) {
  return {
    session: {
      user: { id: userId, role, status: UserStatus.ACTIVE },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    replaced: false,
  };
}

function activeCitizenSubscription() {
  return {
    id: "sub-1",
    ownerUserId: "any",
    planCode: SubscriptionPlanCode.CITIZEN_BASIC,
    status: SubscriptionStatus.ACTIVE,
    seatLimit: 1,
    currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
  };
}

function buildUploadRequest(fileBytes: Uint8Array, conversationId?: string): Request {
  const formData = new FormData();
  const file = new File([Buffer.from(fileBytes)], "contract.pdf", {
    type: "application/pdf",
  });
  formData.set("file", file);
  if (conversationId) {
    formData.set("conversationId", conversationId);
  }
  return new Request("http://localhost/api/ai/documents", {
    method: "POST",
    body: formData,
  });
}

const MINIMAL_PDF = new TextEncoder().encode("%PDF-1.4\nclause content\n%%EOF");

describe("POST /api/ai/documents (ADMIN document-attachment enablement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedConversations = new Map();
    fakeStore = createFakeStore(sharedConversations);
    findActiveSeatForUser.mockResolvedValue(null);
    findActiveOwnedByUserId.mockResolvedValue(activeCitizenSubscription());
    getOrCreate.mockResolvedValue({
      id: "usage-1",
      caseAnalysisCount: 0,
      documentAnalysisCount: 0,
      legalAiQueryCount: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    increment.mockResolvedValue(undefined);
  });

  it("1. CLIENT upload still works, still goes through citizen entitlement", async () => {
    const { POST } = await import("@/app/api/ai/documents/route");
    lookupAuthSession.mockResolvedValue(sessionFor("client-1", UserRole.CLIENT));
    findById.mockResolvedValue(activeRecord("client-1", UserRole.CLIENT));

    const response = await POST(buildUploadRequest(MINIMAL_PDF));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.fileName).toBe("contract.pdf");
    expect(findActiveOwnedByUserId).toHaveBeenCalledWith("client-1");
    expect(getOrCreate).toHaveBeenCalled();
    expect(increment).toHaveBeenCalledTimes(1);
  });

  it("2. ADMIN upload works", async () => {
    const { POST } = await import("@/app/api/ai/documents/route");
    lookupAuthSession.mockResolvedValue(sessionFor("admin-1", UserRole.ADMIN));
    findById.mockResolvedValue(activeRecord("admin-1", UserRole.ADMIN));

    const response = await POST(buildUploadRequest(MINIMAL_PDF));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.fileName).toBe("contract.pdf");
  });

  it("3. a role that is neither CLIENT nor ADMIN (LAWYER) is rejected", async () => {
    const { POST } = await import("@/app/api/ai/documents/route");
    lookupAuthSession.mockResolvedValue(sessionFor("lawyer-1", UserRole.LAWYER));
    findById.mockResolvedValue(activeRecord("lawyer-1", UserRole.LAWYER));

    const response = await POST(buildUploadRequest(MINIMAL_PDF));

    expect(response.status).toBe(403);
    expect(fakeStore.documents).toHaveLength(0);
  });

  it("4. ADMIN never touches the citizen subscription/usage repositories", async () => {
    const { POST } = await import("@/app/api/ai/documents/route");
    lookupAuthSession.mockResolvedValue(sessionFor("admin-2", UserRole.ADMIN));
    findById.mockResolvedValue(activeRecord("admin-2", UserRole.ADMIN));
    // Deliberately leave findActiveOwnedByUserId resolving an active citizen
    // subscription for someone else, and no seat/subscription set up for
    // "admin-2" — if the route mistakenly ran assertCitizenAiOperation for
    // ADMIN, it would hit ForbiddenError (role check) before ever reaching
    // these repositories, so asserting they were never called proves the
    // entitlement path was skipped, not merely that it happened to pass.
    findActiveSeatForUser.mockResolvedValue(null);
    findActiveOwnedByUserId.mockResolvedValue(null);

    const response = await POST(buildUploadRequest(MINIMAL_PDF));

    expect(response.status).toBe(201);
    expect(findActiveSeatForUser).not.toHaveBeenCalled();
    expect(findActiveOwnedByUserId).not.toHaveBeenCalled();
    expect(getOrCreate).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it("5. existing file validation is unchanged for both CLIENT and ADMIN", async () => {
    const { POST } = await import("@/app/api/ai/documents/route");
    const notAPdf = new TextEncoder().encode("not-a-pdf-at-all");

    lookupAuthSession.mockResolvedValue(sessionFor("client-3", UserRole.CLIENT));
    findById.mockResolvedValue(activeRecord("client-3", UserRole.CLIENT));
    const clientResponse = await POST(buildUploadRequest(notAPdf));
    expect(clientResponse.status).toBe(400);

    lookupAuthSession.mockResolvedValue(sessionFor("admin-3", UserRole.ADMIN));
    findById.mockResolvedValue(activeRecord("admin-3", UserRole.ADMIN));
    const adminResponse = await POST(buildUploadRequest(notAPdf));
    expect(adminResponse.status).toBe(400);

    expect(fakeStore.documents).toHaveLength(0);
  });

  it("6. an ADMIN-uploaded document is usable in that same ADMIN's own conversation", async () => {
    const { POST } = await import("@/app/api/ai/documents/route");
    lookupAuthSession.mockResolvedValue(sessionFor("admin-4", UserRole.ADMIN));
    findById.mockResolvedValue(activeRecord("admin-4", UserRole.ADMIN));

    const response = await POST(buildUploadRequest(MINIMAL_PDF));
    expect(response.status).toBe(201);
    const body = await response.json();

    const extracts = await fakeStore.listOwnedDocumentExtracts(
      body.conversationId,
      "admin-4",
    );
    expect(extracts).toHaveLength(1);
    expect(extracts[0]!.extractStatus).toBe("OK");
  });

  it("7. cross-user document access remains forbidden, including for ADMIN vs. another user's conversation", async () => {
    const { POST } = await import("@/app/api/ai/documents/route");

    lookupAuthSession.mockResolvedValue(sessionFor("client-owner", UserRole.CLIENT));
    findById.mockResolvedValue(activeRecord("client-owner", UserRole.CLIENT));
    const ownerResponse = await POST(buildUploadRequest(MINIMAL_PDF));
    expect(ownerResponse.status).toBe(201);
    const { conversationId } = await ownerResponse.json();

    lookupAuthSession.mockResolvedValue(sessionFor("admin-5", UserRole.ADMIN));
    findById.mockResolvedValue(activeRecord("admin-5", UserRole.ADMIN));
    const intruderResponse = await POST(
      buildUploadRequest(MINIMAL_PDF, conversationId),
    );

    expect(intruderResponse.status).toBe(404);
    const extractsForOwner = await fakeStore.listOwnedDocumentExtracts(
      conversationId,
      "client-owner",
    );
    const extractsForAdmin = await fakeStore.listOwnedDocumentExtracts(
      conversationId,
      "admin-5",
    );
    expect(extractsForOwner).toHaveLength(1);
    expect(extractsForAdmin).toHaveLength(0);
  });
});
