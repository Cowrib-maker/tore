import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type {
  LegalAiCompletionPort,
  LegalAiCreateTurnInput,
  LegalAiCreateTurnResult,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";
import {
  DomainLabel,
  PromptTurnKind,
  type IDomainFilter,
  type IPromptBuilder,
  type IUserTypeService,
} from "@/engine/gateway";
import type { IntentClassification, IntentService } from "@/engine/intent";
import { IntentType } from "@/engine/intent";
import type { ReasoningPlan, ReasoningService } from "@/engine/reasoning";

const HISTORY_LIMIT = 30;
const INTENT_CONFIDENCE_FLOOR = 0.5;

export type LegalAiServiceDependencies = {
  domainFilter: IDomainFilter;
  userTypeService: IUserTypeService;
  promptBuilder: IPromptBuilder;
  intent: IntentService;
  reasoning: ReasoningService;
  store: LegalAiStore;
  completion: LegalAiCompletionPort;
};

/**
 * Application adapter for TORE Legal AI chat.
 *
 * Orchestrates gateway classification, intent, optional reasoning-plan
 * context, prompt construction, OpenAI completion, and persistence.
 * Does not call the legal-data-engine or in-memory retrieval corpus.
 */
export class LegalAiService {
  constructor(private readonly dependencies: LegalAiServiceDependencies) {}

  async createTurn(
    input: LegalAiCreateTurnInput,
  ): Promise<LegalAiCreateTurnResult> {
    const message = input.message.trim();
    if (!message) {
      throw new LegalAiError("Асуултаа оруулна уу.", 400);
    }

    if (!this.dependencies.completion.isConfigured()) {
      console.error("OPENAI_API_KEY is not configured.");
      throw new LegalAiError("AI үйлчилгээний тохиргоо хийгдээгүй байна.", 500);
    }

    const conversation = await this.resolveConversation(
      input.userId,
      input.conversationId,
      message,
    );

    await this.dependencies.store.createUserMessage({
      conversationId: conversation.id,
      content: message,
    });

    const history = await this.dependencies.store.listMessages(
      conversation.id,
      HISTORY_LIMIT,
    );

    const userType = this.dependencies.userTypeService.resolve(
      input.userContext,
    );
    const domainResult = await this.dependencies.domainFilter.classify(message);
    const intent = await this.dependencies.intent.classify(message);
    const turnKind = resolveTurnKind(domainResult.domain, intent);

    const reasoningPlan =
      turnKind === PromptTurnKind.GENERAL
        ? null
        : this.prepareReasoningPlan(message, intent);

    const prompt = this.dependencies.promptBuilder.build({
      message,
      userType,
      domain: domainResult.domain,
      turnKind,
      intentType: intent.intent,
      intentConfidence: intent.confidence,
      missingInformation: reasoningPlan?.missingInformation,
      corpusAvailable: false,
    });

    const completion = await this.dependencies.completion.complete({
      systemPrompt: prompt.systemPrompt,
      messages: toModelHistory(history),
    });

    const assistantMessage =
      await this.dependencies.store.createAssistantMessage({
        conversationId: conversation.id,
        content:
          completion.content.trim() || "Хариу боловсруулах явцад алдаа гарлаа.",
        provider: "OPENAI",
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      });

    await this.dependencies.store.recordUsage({
      userId: input.userId,
      provider: "OPENAI",
      model: completion.model,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
    });

    return {
      conversationId: conversation.id,
      message: assistantMessage,
      usage: {
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      },
      turnKind,
    };
  }

  private async resolveConversation(
    userId: string,
    conversationId: string | undefined,
    message: string,
  ) {
    if (!conversationId) {
      return this.dependencies.store.createConversation({
        userId,
        title: message.slice(0, 80),
      });
    }

    const existing = await this.dependencies.store.findOwnedConversation(
      conversationId,
      userId,
    );
    if (!existing) {
      throw new LegalAiError("Яриа олдсонгүй.", 404);
    }
    return existing;
  }

  private prepareReasoningPlan(
    message: string,
    intent: IntentClassification,
  ): ReasoningPlan {
    return this.dependencies.reasoning.prepare({
      question: message,
      intent: {
        type: intent.intent,
        confidence: intent.confidence,
      },
      citations: [],
      documents: [],
      graphNeighbors: [],
    });
  }
}

export function resolveTurnKind(
  domain: DomainLabel,
  intent: Pick<IntentClassification, "intent" | "confidence">,
): PromptTurnKind {
  if (domain === DomainLabel.NON_LEGAL) {
    return PromptTurnKind.GENERAL;
  }
  if (
    intent.intent === IntentType.UNKNOWN ||
    intent.confidence < INTENT_CONFIDENCE_FLOOR
  ) {
    return PromptTurnKind.AMBIGUOUS;
  }
  return PromptTurnKind.LEGAL;
}

function toModelHistory(
  history: LegalAiStoredMessage[],
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return history.map((item) => ({
    role: item.role.toLowerCase() as "user" | "assistant" | "system",
    content: item.content,
  }));
}
