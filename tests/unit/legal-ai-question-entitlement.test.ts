import { describe, expect, it } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { createLegalQuestionAccess } from "@/application/legal-ai/legal-question-access";
import { LegalAiService } from "@/application/ai/legal-ai.service";
import type {
  LegalAiCompletionPort,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";
import {
  LegalQuestionStatus,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import {
  PromptBuilderService,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";
import { LegalRelevance, type LegalRelevanceService } from "@/engine/relevance";
import { InMemoryEntitlementUsageRepository } from "@/infrastructure/repositories/in-memory-entitlement-usage-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";

function createStore(): LegalAiStore & {
  conversations: Map<
    string,
    {
      id: string;
      userId?: string;
      guestSessionId?: string;
      caseFileId?: string;
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
      return row;
    },
    async findAccessibleConversation(input) {
      const row = conversations.get(input.id);
      if (!row) return null;
      if (input.userId && row.userId === input.userId) return row;
      if (input.guestSessionId && row.guestSessionId === input.guestSessionId) {
        return row;
      }
      return null;
    },
    async createConversation(input) {
      const id = `conv-${++seq}`;
      const row = {
        id,
        userId: input.userId,
        guestSessionId: input.guestSessionId,
        caseFileId: input.caseFileId,
        questionStatus: LegalQuestionStatus.NEW,
        billedQuestionCount: 0,
      };
      conversations.set(id, row);
      messages.set(id, []);
      return row;
    },
    async listOwnedCaseConversations(userId, caseFileId) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId && row.caseFileId === caseFileId)
        .map((row) => ({
          id: row.id,
          title: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }));
    },
    async listOwnedRecentConversations(userId, take) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId)
        .slice(0, take)
        .map((row) => ({
          id: row.id,
          title: null,
          caseFileId: row.caseFileId ?? null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }));
    },
    async updateQuestionThread(input) {
      const row = conversations.get(input.conversationId);
      if (!row) return;
      row.questionStatus = input.questionStatus as LegalQuestionStatus;
      if (input.incrementBilledQuestion) row.billedQuestionCount += 1;
    },
    async countBilledQuestionsForUser(userId) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId)
        .reduce((sum, row) => sum + row.billedQuestionCount, 0);
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
      return { id: `asst-${++seq}`, role: "ASSISTANT", content: input.content };
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
    async findDocumentByStorageKey() {
      return null;
    },
    async findDocumentIdByConversationId() {
      return null;
    },
    async createConversationDocument() {
      throw new Error("not used");
    },
  };
}

function relevance(value: LegalRelevance): LegalRelevanceService {
  return {
    classify: async ({ message }: { message: string }) => ({
      relevance: value,
      confidence: 0.9,
      reasons: ["test"],
      analysisText: message,
      clarificationMessage: "Нөхцөл байдлаа тодруулна уу?",
    }),
  } as unknown as LegalRelevanceService;
}

function completion(): LegalAiCompletionPort {
  return {
    isConfigured: () => true,
    complete: async () => ({
      content: "Хууль зүйн хариу",
      model: "test-model",
      inputTokens: 1,
      outputTokens: 1,
    }),
  };
}

function createService(
  store: ReturnType<typeof createStore>,
  legalRelevance: LegalRelevanceService,
  access = createLegalQuestionAccess({
    guestSessions: {
      getById: async () => ({
        id: "guest-1",
        freeLegalQuestionsUsed: 0,
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
      incrementFreeLegalQuestionsUsed: async () => {},
    },
    conversations: store,
    subscriptionRepository: new InMemorySubscriptionRepository(),
    entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
  }),
  completionPort: LegalAiCompletionPort = completion(),
) {
  return new LegalAiService({
    domainFilter: new RuleBasedDomainFilter(),
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent: createIntentEngine(),
    reasoning: createReasoningEngine(),
    legalRelevance,
    store,
    completion: completionPort,
    corpusRetriever: {
      retrieveExactCitation: async () => ({
        kind: "unavailable",
        reason: "not_configured",
        authorities: [],
        retrievedAt: null,
      }),
      retrieveLegalQuestion: async () => ({
        kind: "unavailable",
        reason: "not_configured",
        authorities: [],
        retrievedAt: null,
      }),
      verifyCitation: async () => ({ ok: false, reason: "not_configured" }),
    },
    legalQuestionAccess: access,
  });
}

describe("LegalAiService question threads", () => {
  it("allows guest first question, clarification, and final answer as one thread", async () => {
    const store = createStore();
    const used = { count: 0 };
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => ({
          id: "guest-1",
          freeLegalQuestionsUsed: used.count,
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
        incrementFreeLegalQuestionsUsed: async () => {
          used.count += 1;
        },
      },
      conversations: store,
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });

    const first = createService(
      store,
      relevance(LegalRelevance.POSSIBLY_LEGAL),
      access,
    );
    const started = await first.createTurn({
      guestSessionId: "guest-1",
      message: "Айлд хүн байхгүй байхад ороод зурагт аваад явсан.",
    });
    expect(store.conversations.get(started.conversationId)?.questionStatus).toBe(
      LegalQuestionStatus.CLARIFYING,
    );
    expect(store.conversations.get(started.conversationId)?.billedQuestionCount).toBe(
      1,
    );
    expect(used.count).toBe(1);

    const clarified = await createService(
      store,
      relevance(LegalRelevance.LEGAL),
      access,
    ).createTurn({
      guestSessionId: "guest-1",
      conversationId: started.conversationId,
      message: "Тийм, зурагт нь өөр хүний өмч байсан.",
    });
    expect(
      store.conversations.get(clarified.conversationId)?.questionStatus,
    ).toBe(LegalQuestionStatus.ANSWERED);
    expect(
      store.conversations.get(clarified.conversationId)?.billedQuestionCount,
    ).toBe(1);
    expect(used.count).toBe(1);
  });

  it("does not consume the guest free question on NON_LEGAL", async () => {
    const store = createStore();
    const used = { count: 0 };
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => ({
          id: "guest-1",
          freeLegalQuestionsUsed: used.count,
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
        incrementFreeLegalQuestionsUsed: async () => {
          used.count += 1;
        },
      },
      conversations: store,
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });
    await createService(
      store,
      relevance(LegalRelevance.NON_LEGAL),
      access,
    ).createTurn({
      guestSessionId: "guest-1",
      message: "Хамгийн амттай буузны жор ямар вэ?",
    });
    expect(used.count).toBe(0);
    expect([...store.conversations.values()][0]?.billedQuestionCount).toBe(0);
  });

  it("requires authentication for a guest new question after ANSWERED", async () => {
    const store = createStore();
    const used = { count: 1 };
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => ({
          id: "guest-1",
          freeLegalQuestionsUsed: used.count,
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
        incrementFreeLegalQuestionsUsed: async () => {
          used.count += 1;
        },
      },
      conversations: store,
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });
    const conv = await store.createConversation({
      guestSessionId: "guest-1",
      title: "done",
    });
    await store.updateQuestionThread({
      conversationId: conv.id,
      questionStatus: LegalQuestionStatus.ANSWERED,
    });
    await expect(
      createService(store, relevance(LegalRelevance.LEGAL), access).createTurn({
        guestSessionId: "guest-1",
        conversationId: conv.id,
        message: "Тэгвэл цагдаа намайг баривчилж болох уу?",
      }),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
  });

  it("does not consume quota on unpaid-client clarification", async () => {
    const store = createStore();
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => null,
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: store,
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });
    const first = await createService(
      store,
      relevance(LegalRelevance.POSSIBLY_LEGAL),
      access,
    ).createTurn({
      userId: "client-1",
      actorRole: UserRole.CLIENT,
      message: "Хөрш маань хашааг минь нураасан.",
    });
    expect(store.conversations.get(first.conversationId)?.billedQuestionCount).toBe(
      1,
    );
    await createService(store, relevance(LegalRelevance.LEGAL), access).createTurn(
      {
        userId: "client-1",
        actorRole: UserRole.CLIENT,
        conversationId: first.conversationId,
        message: "Тийм, зөвшөөрөлгүй нураасан.",
      },
    );
    expect(store.conversations.get(first.conversationId)?.billedQuestionCount).toBe(
      1,
    );
  });

  it("does not consume quota when OpenAI fails", async () => {
    const store = createStore();
    const used = { count: 0 };
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => ({
          id: "guest-1",
          freeLegalQuestionsUsed: used.count,
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
        incrementFreeLegalQuestionsUsed: async () => {
          used.count += 1;
        },
      },
      conversations: store,
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });
    const failing = {
      isConfigured: () => true,
      complete: async () => {
        throw new LegalAiError(
          "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
          503,
          "AI_UNAVAILABLE",
        );
      },
    };
    await expect(
      createService(
        store,
        relevance(LegalRelevance.LEGAL),
        access,
        failing,
      ).createTurn({
        guestSessionId: "guest-1",
        message: "Хөрш маань хашааг минь нураасан.",
      }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(used.count).toBe(0);
    expect([...store.conversations.values()][0]?.billedQuestionCount ?? 0).toBe(
      0,
    );
  });

  it("consumes paid-citizen quota only on a new legal question", async () => {
    const store = createStore();
    const subscriptions = new InMemorySubscriptionRepository();
    const usage = new InMemoryEntitlementUsageRepository();
    const created = await subscriptions.create({
      ownerUserId: "client-1",
      planCode: SubscriptionPlanCode.CITIZEN_BASIC,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "client-1",
      status: SeatStatus.ACTIVE,
    });
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => null,
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: store,
      subscriptionRepository: subscriptions,
      entitlementUsageRepository: usage,
    });
    const first = await createService(
      store,
      relevance(LegalRelevance.LEGAL),
      access,
    ).createTurn({
      userId: "client-1",
      actorRole: UserRole.CLIENT,
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?",
    });
    const periodStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const row = await usage.getOrCreate({
      userId: "client-1",
      subscriptionId: created.id,
      periodStart,
    });
    expect(row.legalAiQueryCount).toBe(1);
    expect(store.conversations.get(first.conversationId)?.billedQuestionCount).toBe(
      1,
    );
  });

  it("requires billing for an unpaid citizen new question after the free thread", async () => {
    const store = createStore();
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => null,
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: store,
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });
    const first = await createService(
      store,
      relevance(LegalRelevance.LEGAL),
      access,
    ).createTurn({
      userId: "client-1",
      actorRole: UserRole.CLIENT,
      message: "Хөрш маань хашааг минь нураасан.",
    });
    expect(store.conversations.get(first.conversationId)?.billedQuestionCount).toBe(
      1,
    );
    await expect(
      createService(store, relevance(LegalRelevance.LEGAL), access).createTurn({
        userId: "client-1",
        actorRole: UserRole.CLIENT,
        message: "Гэрээний заалт ойлгомжгүй байна.",
      }),
    ).rejects.toMatchObject({ code: "BILLING_REQUIRED", statusCode: 402 });
  });
});

describe("EntitlementError mapping", () => {
  it("keeps authentication and billing codes distinct", () => {
    expect(new EntitlementError("a", "AUTHENTICATION_REQUIRED", 401).statusCode).toBe(
      401,
    );
    expect(new EntitlementError("b", "BILLING_REQUIRED", 402).statusCode).toBe(
      402,
    );
  });
});
