import { describe, expect, it, vi } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import {
  LegalAiService,
  resolveTurnKind,
} from "@/application/ai/legal-ai.service";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import { CitationVerificationStatus } from "@/application/ai/legal-corpus";
import type {
  LegalAiCompletionPort,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";
import {
  DomainLabel,
  PromptBuilderService,
  PromptTurnKind,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { IntentType, createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";

function createStore(): LegalAiStore & {
  conversations: Map<string, { id: string; userId: string }>;
  userMessages: string[];
  assistantMessages: string[];
  usageCount: number;
  citations: Array<{ messageId: string; title: string; sourceType: string }>;
} {
  const conversations = new Map<string, { id: string; userId: string }>();
  const messages = new Map<string, LegalAiStoredMessage[]>();
  let seq = 0;

  return {
    conversations,
    userMessages: [],
    assistantMessages: [],
    usageCount: 0,
    citations: [],
    async findOwnedConversation(id, userId) {
      const row = conversations.get(id);
      if (!row || row.userId !== userId) {
        return null;
      }
      return { id: row.id };
    },
    async createConversation(input) {
      const id = `conv-${++seq}`;
      conversations.set(id, { id, userId: input.userId });
      messages.set(id, []);
      return { id };
    },
    async createUserMessage(input) {
      this.userMessages.push(input.content);
      messages.get(input.conversationId)?.push({
        role: "USER",
        content: input.content,
      });
    },
    async listMessages(conversationId) {
      return [...(messages.get(conversationId) ?? [])];
    },
    async createAssistantMessage(input) {
      this.assistantMessages.push(input.content);
      const message = {
        id: `asst-${++seq}`,
        role: "ASSISTANT" as const,
        content: input.content,
      };
      messages.get(input.conversationId)?.push({
        role: "ASSISTANT",
        content: input.content,
      });
      return message;
    },
    async recordUsage() {
      this.usageCount += 1;
    },
    async createCitations(input) {
      this.citations.push(
        ...input.citations.map((citation) => ({
          messageId: input.messageId,
          title: citation.title,
          sourceType: citation.sourceType,
        })),
      );
    },
  };
}

function createCompletion(
  complete: LegalAiCompletionPort["complete"] = async () => ({
    content: "mocked-answer",
    model: "gpt-5.6-luna",
    inputTokens: 11,
    outputTokens: 7,
  }),
  configured = true,
): LegalAiCompletionPort & { complete: ReturnType<typeof vi.fn> } {
  const completeFn = vi.fn(complete);
  return {
    isConfigured: () => configured,
    complete: completeFn,
  };
}

function createRetriever(
  retrieve: LegalCorpusRetriever["retrieveExactCitation"] = async () => ({
    kind: "unavailable",
    reason: "not_configured",
    authorities: [],
    retrievedAt: null,
  }),
  verify: LegalCorpusRetriever["verifyCitation"] = async () => ({
    ok: false,
    reason: "not_configured",
  }),
): LegalCorpusRetriever & {
  retrieveExactCitation: ReturnType<typeof vi.fn>;
  verifyCitation: ReturnType<typeof vi.fn>;
} {
  const retrieveExactCitation = vi.fn(retrieve);
  const verifyCitation = vi.fn(verify);
  return { retrieveExactCitation, verifyCitation };
}

function sampleVerdict(
  status: (typeof CitationVerificationStatus)[keyof typeof CitationVerificationStatus] = CitationVerificationStatus.VALID,
) {
  if (status === CitationVerificationStatus.VALID) {
    return {
      query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      status,
      nodeId: "node-1",
      documentVersionId: "ver-1",
      locator: "art-17/p-1",
      reasons: ["citation_unique"],
    };
  }
  return {
    query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
    status,
    nodeId: null,
    documentVersionId: null,
    locator: null,
    reasons:
      status === CitationVerificationStatus.CONFLICT
        ? ["citation_conflict"]
        : ["citation_unresolved"],
  };
}

function sampleAuthority(overrides: Partial<{
  nodeId: string;
  documentVersionId: string;
  excerpt: string;
}> = {}) {
  return {
    nodeId: overrides.nodeId ?? "node-1",
    documentId: "doc-1",
    documentVersionId: overrides.documentVersionId ?? "ver-1",
    locator: "art-17/p-1",
    title: "Эрүүгийн хууль",
    excerpt: overrides.excerpt ?? "Гэмт хэрэг гэж хуулиар хориглосон үйлдэл.",
    contentHash: "hash-node",
    sourceContentHash: "hash-source",
    parserId: "legalinfo-html-v1",
    archiveRecordId: "arch-1",
    effectiveFrom: "2017-07-01T00:00:00.000Z",
    effectiveTo: null,
  };
}

const NON_LEGAL_REFUSAL_MESSAGE =
  "Би TORE Legal AI — хууль зүйн асуудлаар туслах зориулалттай AI. Таны асуулт хууль зүйн асуудалтай холбоогүй байна. Хэрэв танд хууль, эрх зүйн асуудал байгаа бол нөхцөл байдлаа бичээрэй, би тусалъя.";

function createService(overrides?: {
  store?: ReturnType<typeof createStore>;
  completion?: ReturnType<typeof createCompletion>;
  reasoning?: ReturnType<typeof createReasoningEngine>;
  corpusRetriever?: ReturnType<typeof createRetriever>;
}) {
  const store = overrides?.store ?? createStore();
  const completion = overrides?.completion ?? createCompletion();
  const reasoning = overrides?.reasoning ?? createReasoningEngine();
  const corpusRetriever = overrides?.corpusRetriever ?? createRetriever();
  const intent = createIntentEngine();
  const service = new LegalAiService({
    domainFilter: new RuleBasedDomainFilter(),
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent,
    reasoning,
    store,
    completion,
    corpusRetriever,
  });
  return { service, store, completion, reasoning, corpusRetriever, intent };
}

describe("resolveTurnKind", () => {
  it("treats non-legal domain as GENERAL even when intent is unknown", () => {
    expect(
      resolveTurnKind(DomainLabel.NON_LEGAL, {
        intent: IntentType.UNKNOWN,
        confidence: 0,
      }),
    ).toBe(PromptTurnKind.GENERAL);
  });

  it("treats legal domain with unknown or low-confidence intent as AMBIGUOUS", () => {
    expect(
      resolveTurnKind(DomainLabel.LEGAL, {
        intent: IntentType.UNKNOWN,
        confidence: 0,
      }),
    ).toBe(PromptTurnKind.AMBIGUOUS);
    expect(
      resolveTurnKind(DomainLabel.LEGAL, {
        intent: IntentType.CIVIL_LAW,
        confidence: 0.2,
      }),
    ).toBe(PromptTurnKind.AMBIGUOUS);
  });

  it("treats legal domain with a confident intent as LEGAL", () => {
    expect(
      resolveTurnKind(DomainLabel.LEGAL, {
        intent: IntentType.EMPLOYMENT_DISPUTE,
        confidence: 0.8,
      }),
    ).toBe(PromptTurnKind.LEGAL);
  });
});

describe("LegalAiService", () => {
  it("answers an authenticated legal question and persists both messages", async () => {
    const reasoning = createReasoningEngine();
    const prepare = vi.spyOn(reasoning, "prepare");
    const { service, store, completion, corpusRetriever } = createService({
      reasoning,
    });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?",
    });

    expect(result.turnKind).toBe(PromptTurnKind.LEGAL);
    expect(result.conversationId).toMatch(/^conv-/);
    expect(result.message.role).toBe("ASSISTANT");
    expect(result.message.content).toBe("mocked-answer");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(store.userMessages).toEqual(["Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?"]);
    expect(store.assistantMessages).toEqual(["mocked-answer"]);
    expect(store.usageCount).toBe(1);
    expect(prepare).toHaveBeenCalledOnce();

    const systemPrompt = completion.complete.mock.calls[0]?.[0]?.systemPrompt ?? "";
    expect(systemPrompt).toContain("хууль зүйн мэдээллийн асуулт");
    expect(systemPrompt).toContain("баталгаатай эх өгөөгүй");
    expect(corpusRetriever.retrieveExactCitation).not.toHaveBeenCalled();
    expect(corpusRetriever.verifyCitation).not.toHaveBeenCalled();
  });

  it("refuses a non-legal question without calling OpenAI or the legal corpus", async () => {
    const reasoning = createReasoningEngine();
    const prepare = vi.spyOn(reasoning, "prepare");
    const { service, store, completion, corpusRetriever, intent } = createService({
      reasoning,
    });
    const classify = vi.spyOn(intent, "classify");

    const result = await service.createTurn({
      userId: "user-1",
      message: "Elon Musk хэдэн хүүхэдтэй вэ?",
    });

    expect(result.turnKind).toBe(PromptTurnKind.GENERAL);
    expect(result.message.content).toBe(NON_LEGAL_REFUSAL_MESSAGE);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(store.conversations.size).toBe(1);
    expect(store.userMessages).toEqual(["Elon Musk хэдэн хүүхэдтэй вэ?"]);
    expect(store.assistantMessages).toEqual([NON_LEGAL_REFUSAL_MESSAGE]);
    expect(store.usageCount).toBe(0);
    expect(classify).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(completion.complete).not.toHaveBeenCalled();
    expect(corpusRetriever.retrieveExactCitation).not.toHaveBeenCalled();
    expect(corpusRetriever.verifyCitation).not.toHaveBeenCalled();
  });

  it("treats an ambiguous legal question as clarification, not a firm conclusion", async () => {
    const { service, completion } = createService();

    const result = await service.createTurn({
      userId: "user-1",
      message: "Хууль",
    });

    expect(result.turnKind).toBe(PromptTurnKind.AMBIGUOUS);
    const systemPrompt = completion.complete.mock.calls[0]?.[0]?.systemPrompt ?? "";
    expect(systemPrompt).toContain("тодорхойгүй");
    expect(systemPrompt).toContain("тодруулах асуулт");
    expect(systemPrompt).toContain("болзошгүй");
  });

  it("reuses conversationId for the owning user", async () => {
    const { service, store } = createService();

    const first = await service.createTurn({
      userId: "user-1",
      message: "Гэрээ гэж юу вэ?",
    });
    const second = await service.createTurn({
      userId: "user-1",
      conversationId: first.conversationId,
      message: "Цаг агаар ямар вэ?",
    });

    expect(second.conversationId).toBe(first.conversationId);
    expect(store.conversations.size).toBe(1);
    expect(store.userMessages).toHaveLength(2);
    expect(store.assistantMessages).toHaveLength(2);
  });

  it("persists the user message before generating an assistant reply", async () => {
    const store = createStore();
    const order: string[] = [];
    const originalCreateUser = store.createUserMessage.bind(store);
    store.createUserMessage = async (input) => {
      order.push("user");
      await originalCreateUser(input);
    };
    const completion = createCompletion(async () => {
      order.push("complete");
      return {
        content: "ok",
        model: "gpt-5.6-luna",
        inputTokens: 1,
        outputTokens: 1,
      };
    });
    const { service } = createService({ store, completion });

    await service.createTurn({
      userId: "user-1",
      message: "Гэрээ цуцлах журам юу вэ?",
    });

    expect(order).toEqual(["user", "complete"]);
    expect(store.assistantMessages).toEqual(["ok"]);
  });

  it("rejects a missing OpenAI key before creating a conversation", async () => {
    const { service, store, completion } = createService({
      completion: createCompletion(undefined, false),
    });

    await expect(
      service.createTurn({
        userId: "user-1",
        message: "Гэрээ гэж юу вэ?",
      }),
    ).rejects.toMatchObject({
      message: "AI үйлчилгээний тохиргоо хийгдээгүй байна.",
      statusCode: 500,
    } satisfies Partial<LegalAiError>);

    expect(store.conversations.size).toBe(0);
    expect(store.userMessages).toEqual([]);
    expect(completion.complete).not.toHaveBeenCalled();
  });

  it("does not let a user continue another user's conversation", async () => {
    const { service, store, completion } = createService();
    const owner = await service.createTurn({
      userId: "owner",
      message: "Гэрээ гэж юу вэ?",
    });
    completion.complete.mockClear();

    await expect(
      service.createTurn({
        userId: "intruder",
        conversationId: owner.conversationId,
        message: "Нууц асуулт",
      }),
    ).rejects.toMatchObject({
      message: "Яриа олдсонгүй.",
      statusCode: 404,
    } satisfies Partial<LegalAiError>);

    expect(store.userMessages).toEqual(["Гэрээ гэж юу вэ?"]);
    expect(completion.complete).not.toHaveBeenCalled();
  });

  it("includes safety rules that forbid fake lawyers and sources", async () => {
    const { service, completion } = createService();

    await service.createTurn({
      userId: "user-1",
      message: "Надад өмгөөлөгч санал болгооч",
    });

    const systemPrompt = completion.complete.mock.calls[0]?.[0]?.systemPrompt ?? "";
    expect(systemPrompt).toContain("хуульч, өмгөөлөгч биш");
    expect(systemPrompt).toContain("Зохиомол хуульч");
    expect(systemPrompt).toContain("Зохиомол хууль");
    expect(systemPrompt).toContain("тохирох хувь");
    expect(systemPrompt).toContain("Америкийн хууль");
    expect(systemPrompt).toContain("баримт шинжлэх пайплайн");
  });

  it("preserves legal-role uncertainty instead of stating status as fact", async () => {
    const { service, completion } = createService();

    await service.createTurn({
      userId: "user-1",
      message: "Намайг зодсон. Би хохирогч уу, ямар хууль хамаарах вэ?",
    });

    const systemPrompt = completion.complete.mock.calls[0]?.[0]?.systemPrompt ?? "";
    expect(systemPrompt).toContain("БАРИМТТАЙГҮЙГЭЭР");
    expect(systemPrompt).toContain("хохирогчийн байр суурьтай байж болзошгүй");
    expect(systemPrompt).toContain("Баримт: хэрэглэгчийн хэлсэн зүйл");
    expect(systemPrompt).toContain("Тодорхойгүй");
  });

  it("rejects an empty message with the existing 400 contract", async () => {
    const { service, store } = createService();

    await expect(
      service.createTurn({ userId: "user-1", message: "   " }),
    ).rejects.toMatchObject({
      message: "Асуултаа оруулна уу.",
      statusCode: 400,
    } satisfies Partial<LegalAiError>);
    expect(store.conversations.size).toBe(0);
  });

  it("passes a verified exact citation into OpenAI context and persists AICitation", async () => {
    const corpusRetriever = createRetriever(
      async () => ({
        kind: "retrieved",
        status: "ok",
        retrievedAt: "2026-08-17T00:00:00.000Z",
        authorities: [sampleAuthority()],
      }),
      async () => ({
        ok: true,
        verdict: sampleVerdict(CitationVerificationStatus.VALID),
      }),
    );
    const { service, store, completion } = createService({ corpusRetriever });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
    });

    expect(corpusRetriever.retrieveExactCitation).toHaveBeenCalledWith({
      question: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      locator: "art-17/p-1",
    });
    expect(corpusRetriever.verifyCitation).toHaveBeenCalledWith({
      query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      nodeId: "node-1",
      documentId: "doc-1",
      locator: "art-17/p-1",
    });
    const systemPrompt = completion.complete.mock.calls[0]?.[0]?.systemPrompt ?? "";
    expect(systemPrompt).toContain("VERIFIED LEGAL SOURCES");
    expect(systemPrompt).toContain("Гэмт хэрэг гэж хуулиар хориглосон үйлдэл.");
    expect(systemPrompt).toContain("ver-1");
    expect(store.citations).toEqual([
      {
        messageId: result.message.id,
        title: "Эрүүгийн хууль",
        sourceType: "legal-data-engine",
      },
    ]);
    expect(store.usageCount).toBe(1);
  });

  it("does not treat a unique retrieve match as law until official verification is VALID", async () => {
    const corpusRetriever = createRetriever(
      async () => ({
        kind: "retrieved",
        status: "ok",
        authorities: [sampleAuthority()],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      }),
      async () => ({
        ok: true,
        verdict: sampleVerdict(CitationVerificationStatus.UNRESOLVED),
      }),
    );
    const { service, store, completion } = createService({ corpusRetriever });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Эрүүгийн хуулийн 17.1",
    });

    expect(corpusRetriever.retrieveExactCitation).toHaveBeenCalledOnce();
    expect(corpusRetriever.verifyCitation).toHaveBeenCalledOnce();
    expect(completion.complete).not.toHaveBeenCalled();
    expect(store.citations).toEqual([]);
    expect(store.usageCount).toBe(0);
    expect(result.message.content).toContain("баталгаажуулж чадсангүй");
    expect(result.message.content).toContain("таамгаар тайлбарлахгүй");
  });

  it("does not treat official CONFLICT as authoritative law", async () => {
    const corpusRetriever = createRetriever(
      async () => ({
        kind: "retrieved",
        status: "ok",
        authorities: [
          sampleAuthority(),
          sampleAuthority({ nodeId: "node-2", documentVersionId: "ver-2" }),
        ],
        retrievedAt: "2026-08-17T00:00:00.000Z",
      }),
      async () => ({
        ok: true,
        verdict: sampleVerdict(CitationVerificationStatus.CONFLICT),
      }),
    );
    const { service, completion, store } = createService({ corpusRetriever });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Хөдөлмөрийн тухай хуулийн 43 дугаар зүйл",
    });

    expect(corpusRetriever.verifyCitation).toHaveBeenCalledOnce();
    expect(completion.complete).not.toHaveBeenCalled();
    expect(store.citations).toEqual([]);
    expect(result.message.content).toContain("нэг утгатай баталгаажуулж чадсангүй");
  });

  it("does not guess a version when AS_OF_UNAVAILABLE", async () => {
    const corpusRetriever = createRetriever(async () => ({
      kind: "as_of_unavailable",
      authorities: [],
      retrievedAt: "2026-08-17T00:00:00.000Z",
    }));
    const { service, completion, corpusRetriever: retriever } = createService({
      corpusRetriever,
    });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
    });

    expect(retriever.verifyCitation).not.toHaveBeenCalled();
    expect(completion.complete).not.toHaveBeenCalled();
    expect(result.message.content).toContain("хүчинтэй хувилбар");
  });

  it("returns a safe source-unavailable reply when retrieve times out", async () => {
    const corpusRetriever = createRetriever(async () => ({
      kind: "unavailable",
      reason: "timeout",
      authorities: [],
      retrievedAt: null,
    }));
    const { service, completion, store } = createService({ corpusRetriever });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
    });

    expect(corpusRetriever.verifyCitation).not.toHaveBeenCalled();
    expect(completion.complete).not.toHaveBeenCalled();
    expect(store.citations).toEqual([]);
    expect(result.message.content).toContain("холбогдож чадсангүй");
  });

  it("returns a safe source-unavailable reply when verify is 401/403/500/timeout", async () => {
    for (const reason of [
      "unauthorized",
      "server_error",
      "timeout",
    ] as const) {
      const corpusRetriever = createRetriever(
        async () => ({
          kind: "retrieved",
          status: "ok",
          authorities: [sampleAuthority()],
          retrievedAt: "2026-08-17T00:00:00.000Z",
        }),
        async () => ({ ok: false, reason }),
      );
      const { service, completion, store } = createService({ corpusRetriever });

      const result = await service.createTurn({
        userId: "user-1",
        message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      });

      expect(completion.complete).not.toHaveBeenCalled();
      expect(store.citations).toEqual([]);
      expect(result.message.content).toContain("холбогдож чадсангүй");
    }
  });

  it("does not call retrieve or verify for a legal question without an exact citation", async () => {
    const { service, corpusRetriever, completion } = createService();

    await service.createTurn({
      userId: "user-1",
      message: "Гэрээ цуцлах журам юу вэ?",
    });

    expect(corpusRetriever.retrieveExactCitation).not.toHaveBeenCalled();
    expect(corpusRetriever.verifyCitation).not.toHaveBeenCalled();
    expect(completion.complete).toHaveBeenCalledOnce();
  });

  it("still calls OpenAI for a legal question when no exact citation requires corpus retrieval", async () => {
    const { service, completion, corpusRetriever } = createService();

    const result = await service.createTurn({
      userId: "user-1",
      message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?",
    });

    expect(result.turnKind).toBe(PromptTurnKind.LEGAL);
    expect(result.message.content).toBe("mocked-answer");
    expect(corpusRetriever.retrieveExactCitation).not.toHaveBeenCalled();
    expect(corpusRetriever.verifyCitation).not.toHaveBeenCalled();
    expect(completion.complete).toHaveBeenCalledOnce();
  });

  it("uses retrieve then verify then OpenAI for an exact legal citation", async () => {
    const corpusRetriever = createRetriever(
      async () => ({
        kind: "retrieved",
        status: "ok",
        retrievedAt: "2026-08-17T00:00:00.000Z",
        authorities: [sampleAuthority()],
      }),
      async () => ({
        ok: true,
        verdict: sampleVerdict(CitationVerificationStatus.VALID),
      }),
    );
    const { service, completion } = createService({ corpusRetriever });

    await service.createTurn({
      userId: "user-1",
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
    });

    expect(corpusRetriever.retrieveExactCitation).toHaveBeenCalledOnce();
    expect(corpusRetriever.verifyCitation).toHaveBeenCalledOnce();
    expect(completion.complete).toHaveBeenCalledOnce();
    const retrieveOrder = corpusRetriever.retrieveExactCitation.mock.invocationCallOrder[0];
    const verifyOrder = corpusRetriever.verifyCitation.mock.invocationCallOrder[0];
    const completeOrder = completion.complete.mock.invocationCallOrder[0];
    expect(retrieveOrder).toBeLessThan(verifyOrder);
    expect(verifyOrder).toBeLessThan(completeOrder);
  });
});
