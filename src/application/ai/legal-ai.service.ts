import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";
import {
  nullIfBlank,
  type LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";
import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import {
  LegalAiCapability,
  resolveLegalAiCapability,
} from "@/application/ai/legal-ai-capability";
import type { LegalAiCaseContextLoader } from "@/application/ai/legal-ai-case-context";
import { formatLegalAiCaseContextBlock } from "@/application/ai/legal-ai-case-context";
import {
  classifyLegalAiTask,
  stagesForTask,
  taskRequiresLegalRetrieval,
} from "@/application/ai/legal-ai-task";
import {
  MISSING_LEGAL_SOURCE_MESSAGE,
  resolveLegalAuthorities,
} from "@/application/ai/resolve-legal-authorities";
import type {
  LegalAiCompletionPort,
  LegalAiCreateTurnInput,
  LegalAiCreateTurnResult,
  LegalAiConversationDocumentMeta,
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
import {
  LegalRelevance,
  buildClarificationMessage,
  type LegalRelevanceService,
} from "@/engine/relevance";
import { LegalQuestionStatus, UserRole } from "@/domain/enums";
import { decideLegalQuestionThreadAction } from "@/domain/legal-ai/legal-question-thread";
import {
  allowAllLegalQuestionAccess,
  type LegalQuestionAccessPort,
  type LegalQuestionSubject,
} from "@/application/legal-ai/legal-question-access";

const HISTORY_LIMIT = 30;
const INTENT_CONFIDENCE_FLOOR = 0.5;
const VERIFIED_SOURCE_TYPE = "legal-data-engine";

const NON_LEGAL_REFUSAL_CITIZEN =
  "Би TORE Chat — хууль зүйн асуудлаар энгийнээр туслах зориулалттай. Таны асуулт хууль зүйн асуудалтай холбоогүй байна. Хэрэв танд хууль, эрх зүйн асуудал байгаа бол нөхцөл байдлаа бичээрэй, би тусалъя.";

const NON_LEGAL_REFUSAL_LAWYER =
  "Би TORE Legal AI — мэргэжлийн хууль зүйн шинжилгээний туслах. Таны асуулт хууль зүйн асуудалтай холбоогүй байна. Хэргийн баримт, судалгаа, эсвэл эрх зүйн асуултаа бичээрэй.";

export type LegalAiServiceDependencies = {
  domainFilter: IDomainFilter;
  userTypeService: IUserTypeService;
  promptBuilder: IPromptBuilder;
  intent: IntentService;
  reasoning: ReasoningService;
  legalRelevance: LegalRelevanceService;
  store: LegalAiStore;
  completion: LegalAiCompletionPort;
  corpusRetriever: LegalCorpusRetriever;
  legalQuestionAccess?: LegalQuestionAccessPort;
  caseContextLoader?: LegalAiCaseContextLoader;
};

/**
 * Application adapter for TORE Legal AI chat.
 *
 * Orchestrates gateway classification, exact-citation corpus lookup,
 * official citation verification, prompt construction, OpenAI
 * completion, and persistence.
 */
export class LegalAiService {
  private readonly legalQuestionAccess: LegalQuestionAccessPort;

  constructor(private readonly dependencies: LegalAiServiceDependencies) {
    this.legalQuestionAccess =
      dependencies.legalQuestionAccess ?? allowAllLegalQuestionAccess();
  }

  async createTurn(
    input: LegalAiCreateTurnInput,
  ): Promise<LegalAiCreateTurnResult> {
    const message = input.message.trim();
    if (!message) {
      throw new LegalAiError("Асуултаа оруулна уу.", 400);
    }

    const capability = resolveLegalAiCapability({
      actorRole: input.actorRole,
    });
    const subject = this.requireSubject(input);

    let priorMessages: LegalAiStoredMessage[] = [];
    let conversationState: {
      id?: string;
      questionStatus: LegalQuestionStatus;
      caseFileId?: string | null;
    } = { questionStatus: LegalQuestionStatus.NEW };

    if (input.conversationId) {
      const existing = await this.dependencies.store.findAccessibleConversation({
        id: input.conversationId,
        userId: input.userId,
        guestSessionId: input.guestSessionId,
      });
      if (!existing) {
        throw new LegalAiError("Яриа олдсонгүй.", 404);
      }
      conversationState = {
        id: existing.id,
        questionStatus: existing.questionStatus ?? LegalQuestionStatus.NEW,
        caseFileId: existing.caseFileId,
      };
      priorMessages = await this.dependencies.store.listMessages(
        existing.id,
        HISTORY_LIMIT,
      );
    }

    const relevance = await this.dependencies.legalRelevance.classify({
      message,
      conversationContext: priorMessages.map((item) => ({
        role: item.role,
        content: item.content,
      })),
    });

    const thread = decideLegalQuestionThreadAction({
      status: conversationState.questionStatus,
      relevance: relevance.relevance,
    });

    if (thread.type === "START_NEW") {
      await this.legalQuestionAccess.assertCanStartNewLegalQuestion(subject);
    }

    const paidGeneralAccess =
      relevance.relevance === LegalRelevance.NON_LEGAL
        ? await this.legalQuestionAccess.hasPaidLegalAiAccess(subject)
        : false;

    if (
      (relevance.relevance === LegalRelevance.LEGAL || paidGeneralAccess) &&
      !this.dependencies.completion.isConfigured()
    ) {
      console.error("OPENAI_API_KEY is not configured.");
      throw new LegalAiError(
        "AI үйлчилгээний тохиргоо хийгдээгүй байна.",
        503,
        "AI_NOT_CONFIGURED",
      );
    }

    const conversation = await this.resolveConversation(
      input,
      message,
      capability,
    );

    await this.dependencies.store.createUserMessage({
      conversationId: conversation.id,
      content: message,
    });

    const afterReply = async <T extends LegalAiCreateTurnResult>(
      result: T,
    ): Promise<T> => {
      await this.dependencies.store.updateQuestionThread({
        conversationId: conversation.id,
        questionStatus: thread.nextStatus,
        incrementBilledQuestion: thread.type === "START_NEW",
      });
      if (thread.type === "START_NEW") {
        await this.legalQuestionAccess.consumeNewLegalQuestion(subject);
      }
      return result;
    };

    if (relevance.relevance === LegalRelevance.NON_LEGAL) {
      if (!paidGeneralAccess) {
        return afterReply(
          await this.persistSafeReply({
            conversationId: conversation.id,
            content:
              capability === LegalAiCapability.LAWYER
                ? NON_LEGAL_REFUSAL_LAWYER
                : NON_LEGAL_REFUSAL_CITIZEN,
            turnKind: PromptTurnKind.GENERAL,
            capability,
          }),
        );
      }

      return afterReply(
        await this.completeGeneralAnswer({
          conversationId: conversation.id,
          message,
          userContext: input.userContext,
          userId: input.userId,
          capability,
        }),
      );
    }

    if (relevance.relevance === LegalRelevance.POSSIBLY_LEGAL) {
      return afterReply(
        await this.persistSafeReply({
          conversationId: conversation.id,
          content:
            relevance.clarificationMessage ??
            buildClarificationMessage(relevance.issueFamily),
          turnKind: PromptTurnKind.AMBIGUOUS,
          capability,
        }),
      );
    }

    const analysisText = relevance.analysisText || message;
    const history = await this.dependencies.store.listMessages(
      conversation.id,
      HISTORY_LIMIT,
    );

    const userType = this.dependencies.userTypeService.resolve({
      ...input.userContext,
      role: input.actorRole ?? input.userContext?.role,
    });
    await this.dependencies.domainFilter.classify(analysisText);
    const pipelineDomain = DomainLabel.LEGAL;
    const intent = await this.dependencies.intent.classify(analysisText);
    const turnKind = resolveTurnKind(pipelineDomain, intent);

    const document =
      capability === LegalAiCapability.LAWYER && input.userId
        ? await this.dependencies.store.findOwnedDocumentExtract(
            conversation.id,
            input.userId,
          )
        : null;

    const ownedCaseFileId =
      capability === LegalAiCapability.LAWYER
        ? (conversation.caseFileId ??
          conversationState.caseFileId ??
          input.caseFileId)
        : undefined;

    let caseContextBlock: string | undefined;
    if (
      capability === LegalAiCapability.LAWYER &&
      ownedCaseFileId &&
      input.userId &&
      this.dependencies.caseContextLoader
    ) {
      const loaded = await this.dependencies.caseContextLoader.loadOwned({
        userId: input.userId,
        caseFileId: ownedCaseFileId,
      });
      if (loaded) {
        caseContextBlock = formatLegalAiCaseContextBlock(loaded);
      }
    }

    const taskType = classifyLegalAiTask({
      capability,
      intent: intent.intent,
      hasCaseContext: Boolean(caseContextBlock),
      hasDocument: Boolean(document?.extractedText),
      message,
    });
    const reasoningStages = stagesForTask(capability, taskType, {
      hasCaseContext: Boolean(caseContextBlock),
      hasDocument: Boolean(document?.extractedText),
    });
    const requireRetrieval =
      capability === LegalAiCapability.CITIZEN ||
      taskRequiresLegalRetrieval(taskType);

    const authorities = await resolveLegalAuthorities({
      question: message,
      retriever: this.dependencies.corpusRetriever,
      requireRetrieval,
    });

    if (authorities.kind === "refused") {
      return afterReply(
        await this.persistSafeReply({
          conversationId: conversation.id,
          content: authorities.message,
          turnKind,
          capability,
          taskType,
          retrievalInvoked: authorities.retrievalInvoked,
        }),
      );
    }

    const verifiedAuthorities =
      authorities.kind === "verified" ? authorities.authorities : undefined;
    const missingLegalSourceMessage =
      authorities.kind === "empty" && authorities.retrievalInvoked
        ? MISSING_LEGAL_SOURCE_MESSAGE
        : undefined;

    const reasoningPlan = this.prepareReasoningPlan(message, intent);

    const prompt = this.dependencies.promptBuilder.build({
      message,
      userType,
      domain: pipelineDomain,
      turnKind,
      capability,
      taskType,
      reasoningStages,
      intentType: intent.intent,
      intentConfidence: intent.confidence,
      missingInformation: verifiedAuthorities?.length
        ? undefined
        : reasoningPlan?.missingInformation,
      missingLegalSourceMessage,
      corpusAvailable: Boolean(verifiedAuthorities?.length),
      verifiedAuthorities,
      caseContextBlock,
      documentExtract: document?.extractedText.slice(
        0,
        MAX_DOCUMENT_EXTRACT_CHARS,
      ),
      documentFileName: document?.fileName,
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

    if (input.userId) {
      await this.dependencies.store.recordUsage({
        userId: input.userId,
        provider: "OPENAI",
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      });
    }

    let citations: LegalAiSafeCitation[] = [];
    if (verifiedAuthorities?.length) {
      citations = await this.dependencies.store.createCitations({
        messageId: assistantMessage.id,
        citations: verifiedAuthorities.map((authority) => ({
          title: authority.title,
          sourceType: authority.sourceType ?? VERIFIED_SOURCE_TYPE,
          sourceUrl: nullIfBlank(authority.sourceUrl),
          reference: [
            authority.locator,
            authority.documentId,
            authority.documentVersionId,
            authority.nodeId,
          ].join(" | "),
          excerpt: authority.excerpt,
          article: nullIfBlank(authority.article),
          paragraph: nullIfBlank(authority.paragraph),
          sourceVersion: nullIfBlank(authority.sourceVersion),
          validFrom: nullIfBlank(authority.effectiveFrom),
          validTo: nullIfBlank(authority.effectiveTo),
        })),
      });
    }

    return afterReply({
      conversationId: conversation.id,
      message: {
        ...assistantMessage,
        citations,
      },
      usage: {
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      },
      turnKind,
      capability,
      taskType,
      retrievalInvoked: authorities.retrievalInvoked,
    });
  }

  async getConversationMessages(
    userId: string,
    conversationId: string,
  ): Promise<LegalAiStoredMessage[]> {
    const conversation = await this.dependencies.store.findOwnedConversation(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new LegalAiError("Яриа олдсонгүй.", 404);
    }
    return this.dependencies.store.listMessages(conversationId, HISTORY_LIMIT);
  }

  async getConversationDocumentMeta(
    userId: string,
    conversationId: string,
  ): Promise<LegalAiConversationDocumentMeta | null> {
    const conversation = await this.dependencies.store.findOwnedConversation(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new LegalAiError("Яриа олдсонгүй.", 404);
    }
    return this.dependencies.store.findOwnedDocumentMeta(
      conversationId,
      userId,
    );
  }

  private async completeGeneralAnswer(input: {
    conversationId: string;
    message: string;
    userContext: LegalAiCreateTurnInput["userContext"];
    userId?: string;
    capability: LegalAiCapability;
  }): Promise<LegalAiCreateTurnResult> {
    const history = await this.dependencies.store.listMessages(
      input.conversationId,
      HISTORY_LIMIT,
    );
    const userType = this.dependencies.userTypeService.resolve(
      input.userContext,
    );
    const document =
      input.capability === LegalAiCapability.LAWYER && input.userId
        ? await this.dependencies.store.findOwnedDocumentExtract(
            input.conversationId,
            input.userId,
          )
        : null;
    const prompt = this.dependencies.promptBuilder.build({
      message: input.message,
      userType,
      domain: DomainLabel.NON_LEGAL,
      turnKind: PromptTurnKind.GENERAL,
      capability: input.capability,
      corpusAvailable: false,
      documentExtract: document?.extractedText.slice(
        0,
        MAX_DOCUMENT_EXTRACT_CHARS,
      ),
      documentFileName: document?.fileName,
    });
    const completion = await this.dependencies.completion.complete({
      systemPrompt: prompt.systemPrompt,
      messages: toModelHistory(history),
    });
    const assistantMessage =
      await this.dependencies.store.createAssistantMessage({
        conversationId: input.conversationId,
        content:
          completion.content.trim() || "Хариу боловсруулах явцад алдаа гарлаа.",
        provider: "OPENAI",
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      });
    if (input.userId) {
      await this.dependencies.store.recordUsage({
        userId: input.userId,
        provider: "OPENAI",
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      });
    }
    return {
      conversationId: input.conversationId,
      message: {
        ...assistantMessage,
        citations: [],
      },
      usage: {
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      },
      turnKind: PromptTurnKind.GENERAL,
      capability: input.capability,
      retrievalInvoked: false,
    };
  }

  private async persistSafeReply(input: {
    conversationId: string;
    content: string;
    turnKind: PromptTurnKind;
    capability: LegalAiCapability;
    taskType?: LegalAiCreateTurnResult["taskType"];
    retrievalInvoked?: boolean;
  }): Promise<LegalAiCreateTurnResult> {
    const assistantMessage =
      await this.dependencies.store.createAssistantMessage({
        conversationId: input.conversationId,
        content: input.content,
      });

    return {
      conversationId: input.conversationId,
      message: {
        ...assistantMessage,
        citations: [],
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      turnKind: input.turnKind,
      capability: input.capability,
      taskType: input.taskType,
      retrievalInvoked: input.retrievalInvoked ?? false,
    };
  }

  private requireSubject(input: LegalAiCreateTurnInput): LegalQuestionSubject {
    if (input.userId) {
      return {
        kind: "user",
        userId: input.userId,
        role: input.actorRole ?? UserRole.CLIENT,
      };
    }
    if (input.guestSessionId) {
      return { kind: "guest", guestSessionId: input.guestSessionId };
    }
    throw new LegalAiError("Асуултаа оруулна уу.", 400);
  }

  private async resolveConversation(
    input: LegalAiCreateTurnInput,
    message: string,
    capability: LegalAiCapability,
  ) {
    const caseFileId =
      capability === LegalAiCapability.LAWYER && input.userId
        ? input.caseFileId
        : undefined;
    if (!input.conversationId) {
      return this.dependencies.store.createConversation({
        userId: input.userId,
        guestSessionId: input.guestSessionId,
        title: message.slice(0, 80),
        caseFileId,
      });
    }

    const existing = await this.dependencies.store.findAccessibleConversation({
      id: input.conversationId,
      userId: input.userId,
      guestSessionId: input.guestSessionId,
    });
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
