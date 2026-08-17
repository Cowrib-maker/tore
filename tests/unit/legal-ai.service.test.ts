import { describe, expect, it, vi } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import {
  LegalAiService,
  resolveTurnKind,
} from "@/application/ai/legal-ai.service";
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
} {
  const conversations = new Map<string, { id: string; userId: string }>();
  const messages = new Map<string, LegalAiStoredMessage[]>();
  let seq = 0;

  return {
    conversations,
    userMessages: [],
    assistantMessages: [],
    usageCount: 0,
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

function createService(overrides?: {
  store?: ReturnType<typeof createStore>;
  completion?: ReturnType<typeof createCompletion>;
  reasoning?: ReturnType<typeof createReasoningEngine>;
}) {
  const store = overrides?.store ?? createStore();
  const completion = overrides?.completion ?? createCompletion();
  const reasoning = overrides?.reasoning ?? createReasoningEngine();
  const service = new LegalAiService({
    domainFilter: new RuleBasedDomainFilter(),
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent: createIntentEngine(),
    reasoning,
    store,
    completion,
  });
  return { service, store, completion, reasoning };
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
    const { service, store, completion } = createService({ reasoning });

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
    expect(systemPrompt).toContain("холбогдоогүй");
  });

  it("answers an authenticated general question without legal retrieval", async () => {
    const reasoning = createReasoningEngine();
    const prepare = vi.spyOn(reasoning, "prepare");
    const { service, completion } = createService({ reasoning });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Маргааш Улаанбаатарт цаг агаар ямар байх вэ?",
    });

    expect(result.turnKind).toBe(PromptTurnKind.GENERAL);
    expect(prepare).not.toHaveBeenCalled();
    const systemPrompt = completion.complete.mock.calls[0]?.[0]?.systemPrompt ?? "";
    expect(systemPrompt).toContain("ердийн / хууль зүйн бус");
    expect(systemPrompt).toContain("Хэвийн, тустай хариул");
    expect(systemPrompt).not.toContain("Хууль зүйн горимыг идэвхжүүл");
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
});
