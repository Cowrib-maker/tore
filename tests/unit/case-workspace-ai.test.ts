import { beforeEach, describe, expect, it } from "vitest";

import { createOwnedCaseContextLoader } from "@/application/ai/load-owned-legal-ai-case-context";
import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { LegalAiService } from "@/application/ai/legal-ai.service";
import type {
  LegalAiCompletionPort,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";
import type { ActorContext } from "@/application/common/actor-context";
import {
  assertOwnedCaseFileForAi,
  attachCasePdfForLawyer,
  createCaseFileForLawyer,
  deriveCaseActivity,
  listCaseConversationsForLawyer,
  loadCaseWorkspaceForLawyer,
  loadLawyerWorkspaceHome,
  startCaseConversationForLawyer,
  type CaseAiDeps,
  type CaseFileDeps,
} from "@/application/use-cases/case-review";
import { loadLawyerAiWorkbench } from "@/application/use-cases/ai/load-lawyer-ai-workbench";
import { runPersistedCaseAnalysis } from "@/application/use-cases/case-review/deps";
import { LegalQuestionStatus, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { LegalDomain } from "@/engine/doctrine";
import {
  PromptBuilderService,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";
import { createLegalRelevanceEngine } from "@/engine/relevance";
import type {
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
} from "@/application/ai/legal-corpus";
import type { FileStorage } from "@/domain/ports/file-storage";
import { InMemoryCaseFileRepository } from "@/infrastructure/repositories/in-memory-case-file-repository";

import { buildMinimalPdf } from "./helpers/minimal-pdf";

const lawyerA: ActorContext = { userId: "lawyer-a", role: UserRole.LAWYER };
const lawyerB: ActorContext = { userId: "lawyer-b", role: UserRole.LAWYER };

function createAiStore(): LegalAiStore & {
  conversations: Map<
    string,
    {
      id: string;
      userId?: string;
      guestSessionId?: string;
      caseFileId?: string;
      title?: string;
      createdAt: Date;
      updatedAt: Date;
      questionStatus: LegalQuestionStatus;
      billedQuestionCount: number;
    }
  >;
} {
  const conversations = new Map<
    string,
    {
      id: string;
      userId?: string;
      guestSessionId?: string;
      caseFileId?: string;
      title?: string;
      createdAt: Date;
      updatedAt: Date;
      questionStatus: LegalQuestionStatus;
      billedQuestionCount: number;
    }
  >();
  const messages = new Map<string, LegalAiStoredMessage[]>();
  let seq = 0;

  return {
    conversations,
    async countUserLegalAiQuestions() {
      return 0;
    },
    async findOwnedConversation(id, userId) {
      const row = conversations.get(id);
      if (!row || row.userId !== userId) return null;
      return {
        id: row.id,
        questionStatus: row.questionStatus,
        billedQuestionCount: row.billedQuestionCount,
        caseFileId: row.caseFileId ?? null,
      };
    },
    async findAccessibleConversation(input) {
      const row = conversations.get(input.id);
      if (!row) return null;
      if (input.userId && row.userId === input.userId) {
        return {
          id: row.id,
          questionStatus: row.questionStatus,
          billedQuestionCount: row.billedQuestionCount,
          caseFileId: row.caseFileId ?? null,
        };
      }
      return null;
    },
    async createConversation(input) {
      const id = `conv-${++seq}`;
      const now = new Date();
      const row = {
        id,
        userId: input.userId,
        guestSessionId: input.guestSessionId,
        caseFileId: input.caseFileId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
        questionStatus: LegalQuestionStatus.NEW,
        billedQuestionCount: 0,
      };
      conversations.set(id, row);
      messages.set(id, []);
      return {
        id,
        questionStatus: row.questionStatus,
        billedQuestionCount: 0,
        caseFileId: row.caseFileId ?? null,
      };
    },
    async listOwnedCaseConversations(userId, caseFileId) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId && row.caseFileId === caseFileId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((row) => ({
          id: row.id,
          title: row.title ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
    },
    async listOwnedRecentConversations(userId, take) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, take)
        .map((row) => ({
          id: row.id,
          title: row.title ?? null,
          caseFileId: row.caseFileId ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
    },
    async updateQuestionThread() {},
    async countBilledQuestionsForUser() {
      return 0;
    },
    async createUserMessage(input) {
      messages.get(input.conversationId)?.push({
        role: "USER",
        content: input.content,
      });
    },
    async listMessages(conversationId) {
      return [...(messages.get(conversationId) ?? [])];
    },
    async createAssistantMessage(input) {
      messages.get(input.conversationId)?.push({
        role: "ASSISTANT",
        content: input.content,
      });
      return { id: "asst", role: "ASSISTANT", content: input.content };
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
    async findDocumentByStorageKey() {
      return null;
    },
    async createConversationDocument() {
      throw new Error("not used");
    },
  };
}

function createStorage(): FileStorage & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    async upload(input) {
      const key = `${input.purpose}/${input.ownerId}/uuid-${input.fileName}`;
      keys.push(key);
      return {
        key,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        originalFileName: input.fileName,
      };
    },
    async delete() {},
    async getObject() {
      return { body: new Uint8Array(), contentType: "application/pdf" };
    },
    async getUrl(key) {
      return `/api/files/${key}`;
    },
  };
}

function createService(store: LegalAiStore) {
  const domainFilter = new RuleBasedDomainFilter();
  const intent = createIntentEngine();
  const completion: LegalAiCompletionPort = {
    isConfigured: () => true,
    complete: async () => ({
      content: "mocked-answer",
      model: "test",
      inputTokens: 1,
      outputTokens: 1,
    }),
  };
  const corpusRetriever: LegalCorpusRetriever = {
    retrieveExactCitation: async () => ({
      kind: "unavailable",
      reason: "not_configured",
      authorities: [],
      retrievedAt: null,
    }),
    retrieveLegalQuestion: async (
      _input: LegalCorpusRetrieveInput,
    ): Promise<LegalCorpusRetrieveResult> => ({
      kind: "unavailable",
      reason: "not_configured",
      authorities: [],
      retrievedAt: null,
    }),
    verifyCitation: async () => ({
      ok: false,
      reason: "not_configured",
    }),
  };
  return new LegalAiService({
    domainFilter,
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent,
    reasoning: createReasoningEngine(),
    legalRelevance: createLegalRelevanceEngine({ domainFilter, intent }),
    store,
    completion,
    corpusRetriever,
  });
}

describe("case workspace AI integration", () => {
  let repository: InMemoryCaseFileRepository;
  let store: ReturnType<typeof createAiStore>;
  let caseDeps: CaseFileDeps;
  let aiDeps: CaseAiDeps;

  beforeEach(() => {
    repository = new InMemoryCaseFileRepository();
    store = createAiStore();
    caseDeps = { repository, runAnalysis: runPersistedCaseAnalysis };
    aiDeps = { repository, store };
  });

  async function ownedCase(actor = lawyerA, title = "Vehicle sale") {
    return createCaseFileForLawyer(
      actor,
      { title, legalDomain: LegalDomain.CIVIL },
      caseDeps,
    );
  }

  it("lets lawyer A create and list a case-linked conversation", async () => {
    const file = await ownedCase();
    const started = await startCaseConversationForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );
    expect(started.caseId).toBe(file.id);
    expect(store.conversations.get(started.conversationId)?.caseFileId).toBe(
      file.id,
    );
    expect(store.conversations.get(started.conversationId)?.userId).toBe(
      lawyerA.userId,
    );

    const listed = await listCaseConversationsForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(started.conversationId);
    expect(listed[0]?.title).toBe("Vehicle sale");
  });

  it("keeps unattached conversations valid and hidden from the case list", async () => {
    const file = await ownedCase();
    await store.createConversation({
      userId: lawyerA.userId,
      title: "Loose thread",
    });
    await startCaseConversationForLawyer(lawyerA, file.id, aiDeps);

    const listed = await listCaseConversationsForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe("Vehicle sale");

    const unattached = [...store.conversations.values()].find(
      (row) => !row.caseFileId,
    );
    expect(unattached?.title).toBe("Loose thread");
  });

  it("does not let lawyer B list or attach to lawyer A's case", async () => {
    const file = await ownedCase();
    await startCaseConversationForLawyer(lawyerA, file.id, aiDeps);

    await expect(
      listCaseConversationsForLawyer(lawyerB, file.id, aiDeps),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      startCaseConversationForLawyer(lawyerB, file.id, aiDeps),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      assertOwnedCaseFileForAi(lawyerB, file.id, repository),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let lawyer B open lawyer A's case conversation", async () => {
    const file = await ownedCase();
    const started = await startCaseConversationForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );
    const service = createService(store);
    await service.createTurn({
      userId: lawyerA.userId,
      actorRole: UserRole.LAWYER,
      conversationId: started.conversationId,
      message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?",
    });

    await expect(
      service.getConversationMessages(lawyerB.userId, started.conversationId),
    ).rejects.toBeInstanceOf(LegalAiError);

    const history = await service.getConversationMessages(
      lawyerA.userId,
      started.conversationId,
    );
    expect(history.some((item) => item.role === "USER")).toBe(true);
  });

  it("links a new professional turn to an owned case and leaves unattached turns unattached", async () => {
    const file = await ownedCase();
    const service = createService(store);

    const linked = await service.createTurn({
      userId: lawyerA.userId,
      actorRole: UserRole.LAWYER,
      caseFileId: file.id,
      message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?",
    });
    expect(store.conversations.get(linked.conversationId)?.caseFileId).toBe(
      file.id,
    );

    const loose = await service.createTurn({
      userId: lawyerA.userId,
      actorRole: UserRole.LAWYER,
      message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?",
    });
    expect(store.conversations.get(loose.conversationId)?.caseFileId).toBeUndefined();
  });

  it("does not attach a continuing conversation using a forged caseFileId", async () => {
    const file = await ownedCase();
    const other = await ownedCase(lawyerA, "Other matter");
    const service = createService(store);
    const first = await service.createTurn({
      userId: lawyerA.userId,
      actorRole: UserRole.LAWYER,
      message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?",
    });
    await service.createTurn({
      userId: lawyerA.userId,
      actorRole: UserRole.LAWYER,
      conversationId: first.conversationId,
      caseFileId: file.id,
      message: "Гэрээний хуулбарыг хавсаргасан.",
    });
    expect(store.conversations.get(first.conversationId)?.caseFileId).toBeUndefined();

    const listed = await listCaseConversationsForLawyer(lawyerA, other.id, aiDeps);
    expect(listed).toEqual([]);
  });

  it("stores a real PDF on the owned case and forbids lawyer B", async () => {
    const file = await ownedCase();
    const fileStorage = createStorage();
    const payload = await attachCasePdfForLawyer(
      lawyerA,
      {
        caseId: file.id,
        expectedVersion: file.version,
        fileName: "contract.pdf",
        contentType: "application/pdf",
        body: buildMinimalPdf("contract text"),
      },
      { ...caseDeps, fileStorage },
    );

    expect(payload.caseEvidence).toHaveLength(1);
    expect(payload.caseEvidence[0]?.title).toBe("contract.pdf");
    expect(payload.caseEvidence[0]?.fileReference).toMatch(/^evidence\/lawyer-a\//);
    expect(fileStorage.keys).toHaveLength(1);

    const owned = await repository.findOwnedEvidenceByFileReference(
      lawyerA.userId,
      payload.caseEvidence[0]!.fileReference!,
    );
    expect(owned?.caseFileId).toBe(file.id);

    await expect(
      attachCasePdfForLawyer(
        lawyerB,
        {
          caseId: file.id,
          expectedVersion: payload.version,
          fileName: "steal.pdf",
          contentType: "application/pdf",
          body: buildMinimalPdf("no"),
        },
        { ...caseDeps, fileStorage },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("derives activity from existing timestamps only", async () => {
    const file = await ownedCase();
    const started = await startCaseConversationForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );
    const conversations = await listCaseConversationsForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );
    const loaded = await repository.findById(file.id);
    const activity = deriveCaseActivity(loaded!, conversations);
    expect(activity).toHaveLength(2);
    expect(activity.map((item) => item.label)).toEqual(
      expect.arrayContaining(["AI яриа эхлүүлсэн", "Хэрэг үүсгэсэн"]),
    );
    expect(activity.some((item) => item.id.includes(started.conversationId))).toBe(
      true,
    );
  });

  it("loads the case workspace for the owner only", async () => {
    const file = await ownedCase();
    await startCaseConversationForLawyer(lawyerA, file.id, aiDeps);
    const view = await loadCaseWorkspaceForLawyer(lawyerA, file.id, aiDeps);
    expect(view.payload.caseId).toBe(file.id);
    expect(view.conversations).toHaveLength(1);
    expect(view.activity.some((item) => item.label === "Хэрэг үүсгэсэн")).toBe(
      true,
    );

    await expect(
      loadCaseWorkspaceForLawyer(lawyerB, file.id, aiDeps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("loads the lawyer workspace home with owned cases and conversations only", async () => {
    const file = await ownedCase(lawyerA, "Хөдөлмөрийн маргаан");
    const started = await startCaseConversationForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );
    await store.createConversation({
      userId: lawyerA.userId,
      title: "Ерөнхий зөвлөгөө",
    });
    const fileB = await createCaseFileForLawyer(
      lawyerB,
      { title: "B-ийн хэрэг", legalDomain: LegalDomain.CIVIL },
      caseDeps,
    );
    await startCaseConversationForLawyer(lawyerB, fileB.id, aiDeps);

    const homeA = await loadLawyerWorkspaceHome(lawyerA, aiDeps);
    expect(homeA.cases).toHaveLength(1);
    expect(homeA.cases[0]?.title).toBe("Хөдөлмөрийн маргаан");
    expect(homeA.cases[0]?.domainLabel).toBe("Иргэний");
    expect(homeA.cases[0]?.conversationCount).toBe(1);
    expect(homeA.cases[0]?.documentCount).toBe(0);
    expect(homeA.recentConversations).toHaveLength(2);
    expect(
      homeA.recentConversations.find((row) => row.id === started.conversationId)
        ?.caseTitle,
    ).toBe("Хөдөлмөрийн маргаан");
    expect(
      homeA.recentConversations.find((row) => row.title === "Ерөнхий зөвлөгөө")
        ?.caseTitle,
    ).toBeNull();
    expect(homeA.activity.some((item) => item.label.includes("Хөдөлмөрийн маргаан"))).toBe(
      true,
    );
    expect(homeA.summary.caseCount).toBe(1);
    expect(homeA.summary.conversationCount).toBe(2);
    expect(homeA.summary.documentCount).toBe(0);

    const homeB = await loadLawyerWorkspaceHome(lawyerB, aiDeps);
    expect(homeB.cases.map((row) => row.caseId)).not.toContain(file.id);
    expect(homeB.recentConversations.map((row) => row.id)).not.toContain(
      started.conversationId,
    );
    expect(homeB.cases[0]?.title).toBe("B-ийн хэрэг");

    await expect(
      loadLawyerWorkspaceHome(
        { userId: "client-1", role: UserRole.CLIENT },
        aiDeps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns an empty lawyer workspace home when the lawyer has no cases", async () => {
    const home = await loadLawyerWorkspaceHome(lawyerA, aiDeps);
    expect(home.cases).toEqual([]);
    expect(home.recentConversations).toEqual([]);
    expect(home.activity).toEqual([]);
    expect(home.summary).toEqual({
      caseCount: 0,
      analyzedCaseCount: 0,
      notAnalyzedCaseCount: 0,
      conversationCount: 0,
      conversationsLast7Days: 0,
      documentCount: 0,
    });
  });

  it("loads lawyer AI workbench case context only for the owner", async () => {
    const file = await ownedCase(lawyerA, "Бат vs ХХК");
    const started = await startCaseConversationForLawyer(
      lawyerA,
      file.id,
      aiDeps,
    );

    const view = await loadLawyerAiWorkbench(
      lawyerA,
      { conversationId: started.conversationId },
      aiDeps,
    );
    expect(view.conversationId).toBe(started.conversationId);
    expect(view.caseFileId).toBe(file.id);
    expect(view.caseContext?.title).toBe("Бат vs ХХК");
    expect(view.history.some((item) => item.id === started.conversationId)).toBe(
      true,
    );

    const hidden = await loadLawyerAiWorkbench(
      lawyerB,
      {
        conversationId: started.conversationId,
        caseId: file.id,
      },
      aiDeps,
    );
    expect(hidden.conversationId).toBeUndefined();
    expect(hidden.caseContext).toBeNull();
    expect(hidden.caseFileId).toBeUndefined();
  });

  it("loads unattached lawyer AI workbench without inventing case context", async () => {
    const view = await loadLawyerAiWorkbench(lawyerA, {}, aiDeps);
    expect(view.caseContext).toBeNull();
    expect(view.caseFileId).toBeUndefined();
    expect(view.conversationId).toBeUndefined();
  });

  it("loads CaseFile AI context only for the owner", async () => {
    const file = await ownedCase();
    const loader = createOwnedCaseContextLoader(repository);

    const owned = await loader.loadOwned({
      userId: lawyerA.userId,
      caseFileId: file.id,
    });
    expect(owned?.caseId).toBe(file.id);
    expect(owned?.title).toBe("Vehicle sale");

    const stolen = await loader.loadOwned({
      userId: lawyerB.userId,
      caseFileId: file.id,
    });
    expect(stolen).toBeNull();
  });
});
