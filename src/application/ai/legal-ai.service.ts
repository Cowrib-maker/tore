import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";
import {
  citationPinpointFromLocator,
  nullIfBlank,
  type LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";
import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type {
  LegalCitationVerdict,
  LegalCorpusRetriever,
  LegalCorpusRetrieveResult,
} from "@/application/ai/legal-corpus";
import {
  CitationVerificationStatus,
  selectOfficiallyVerifiedAuthorities,
  verifyHintFromRetrieved,
} from "@/application/ai/legal-corpus";
import type {
  LegalAiCompletionPort,
  LegalAiCreateTurnInput,
  LegalAiCreateTurnResult,
  LegalAiConversationDocumentMeta,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";
import { detectExactCitation } from "@/engine/citation";
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

const UNVERIFIED_CITATION_MESSAGE =
  "Энэ заалтыг TORE-ийн баталгаатай эрх зүйн эх сурвалжаас одоогоор баталгаажуулж чадсангүй. Тиймээс заалтын агуулгыг таамгаар тайлбарлахгүй.";

const CONFLICT_CITATION_MESSAGE =
  "Энэ ишлэлийг нэг утгатай баталгаажуулж чадсангүй. Тиймээс аль эх нь хамаарахыг таамгаар сонгохгүй, заалтын агуулгыг таамгаар тайлбарлахгүй.";

const AS_OF_UNAVAILABLE_MESSAGE =
  "Тухайн үед хүчинтэй хувилбарыг баталгаажуулж чадсангүй. Тиймээс заалтын агуулгыг таамгаар тайлбарлахгүй.";

const ENGINE_UNAVAILABLE_MESSAGE =
  "Баталгаатай эрх зүйн эх сурвалжид одоогоор холбогдож чадсангүй. Тиймээс заалтын агуулгыг таамгаар тайлбарлахгүй.";

const NON_LEGAL_REFUSAL_MESSAGE =
  "Би TORE Legal AI — хууль зүйн асуудлаар туслах зориулалттай AI. Таны асуулт хууль зүйн асуудалтай холбоогүй байна. Хэрэв танд хууль, эрх зүйн асуудал байгаа бол нөхцөл байдлаа бичээрэй, би тусалъя.";

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

    const subject = this.requireSubject(input);

    let priorMessages: LegalAiStoredMessage[] = [];
    let conversationState: {
      id?: string;
      questionStatus: LegalQuestionStatus;
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
            content: NON_LEGAL_REFUSAL_MESSAGE,
            turnKind: PromptTurnKind.GENERAL,
          }),
        );
      }

      return afterReply(
        await this.completeGeneralAnswer({
          conversationId: conversation.id,
          message,
          userContext: input.userContext,
          mode: input.mode,
          userId: input.userId,
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
        }),
      );
    }

    const analysisText = relevance.analysisText || message;
    const history = await this.dependencies.store.listMessages(
      conversation.id,
      HISTORY_LIMIT,
    );

    const userType = this.dependencies.userTypeService.resolve(
      input.userContext,
    );
    await this.dependencies.domainFilter.classify(analysisText);
    const pipelineDomain = DomainLabel.LEGAL;
    const intent = await this.dependencies.intent.classify(analysisText);
    const turnKind = resolveTurnKind(pipelineDomain, intent);
    const exactCitation = detectExactCitation(message);

    const verifiedResolution = exactCitation
      ? await this.resolveVerifiedAuthorities({
          question: message,
          query: exactCitation.query,
          locator: exactCitation.locator,
        })
      : { kind: "skipped" as const };

    if (verifiedResolution.kind === "refused") {
      return afterReply(
        await this.persistSafeReply({
          conversationId: conversation.id,
          content: verifiedResolution.message,
          turnKind,
        }),
      );
    }

    const verifiedAuthorities =
      verifiedResolution.kind === "verified"
        ? verifiedResolution.authorities
        : undefined;

    const reasoningPlan = this.prepareReasoningPlan(message, intent);
    const document = input.userId
      ? await this.dependencies.store.findOwnedDocumentExtract(
          conversation.id,
          input.userId,
        )
      : null;

    const prompt = this.dependencies.promptBuilder.build({
      message,
      userType,
      domain: pipelineDomain,
      turnKind,
      mode: input.mode ?? "CITIZEN",
      intentType: intent.intent,
      intentConfidence: intent.confidence,
      missingInformation: verifiedAuthorities?.length
        ? undefined
        : reasoningPlan?.missingInformation,
      corpusAvailable: Boolean(verifiedAuthorities?.length),
      verifiedAuthorities,
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
        citations: verifiedAuthorities.map((authority) => {
          const pinpoint = citationPinpointFromLocator(authority.locator);
          return {
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
            article: nullIfBlank(authority.article) ?? pinpoint.article,
            paragraph: nullIfBlank(authority.paragraph) ?? pinpoint.paragraph,
            sourceVersion: nullIfBlank(authority.sourceVersion),
            validFrom: nullIfBlank(authority.effectiveFrom),
            validTo: nullIfBlank(authority.effectiveTo),
          };
        }),
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
    });
  }

  private async resolveVerifiedAuthorities(input: {
    question: string;
    query: string;
    locator: string | null;
  }): Promise<
    | {
        kind: "verified";
        authorities: Array<{
          title: string;
          locator: string;
          excerpt: string;
          documentId: string;
          documentVersionId: string;
          nodeId: string;
          effectiveFrom: string | null;
          effectiveTo: string | null;
          sourceUrl: string | null;
          sourceVersion: string | null;
          article: string | null;
          paragraph: string | null;
          sourceType: string;
        }>;
      }
    | { kind: "refused"; message: string }
  > {
    const retrieved = await this.dependencies.corpusRetriever.retrieveExactCitation(
      {
        question: input.question,
        query: input.query,
        locator: input.locator,
      },
    );

    const retrieveRefusal = retrieveRefusalMessage(retrieved);
    if (retrieveRefusal) {
      return { kind: "refused", message: retrieveRefusal };
    }

    if (retrieved.kind !== "retrieved") {
      return { kind: "refused", message: ENGINE_UNAVAILABLE_MESSAGE };
    }

    const verification = await this.dependencies.corpusRetriever.verifyCitation({
      question: input.question,
      query: input.query,
      ...verifyHintFromRetrieved(retrieved.authorities),
    });

    if (!verification.ok) {
      return { kind: "refused", message: ENGINE_UNAVAILABLE_MESSAGE };
    }

    const verdictRefusal = verificationRefusalMessage(verification.verdict);
    if (verdictRefusal) {
      return { kind: "refused", message: verdictRefusal };
    }

    const verified = selectOfficiallyVerifiedAuthorities(
      retrieved.authorities,
      verification.verdict,
    );
    if (verified.length === 0) {
      return { kind: "refused", message: UNVERIFIED_CITATION_MESSAGE };
    }

    return {
      kind: "verified",
      authorities: verified.map((authority) => {
        const pinpoint = citationPinpointFromLocator(authority.locator);
        return {
          title: authority.title,
          locator: authority.locator,
          excerpt: authority.excerpt,
          documentId: authority.documentId,
          documentVersionId: authority.documentVersionId,
          nodeId: authority.nodeId,
          effectiveFrom: authority.effectiveFrom,
          effectiveTo: authority.effectiveTo,
          sourceUrl: nullIfBlank(authority.sourceUrl),
          sourceVersion: nullIfBlank(authority.sourceVersion),
          article: nullIfBlank(authority.article) ?? pinpoint.article,
          paragraph: nullIfBlank(authority.paragraph) ?? pinpoint.paragraph,
          sourceType: authority.sourceType ?? VERIFIED_SOURCE_TYPE,
        };
      }),
    };
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
    mode: LegalAiCreateTurnInput["mode"];
    userId?: string;
  }): Promise<LegalAiCreateTurnResult> {
    const history = await this.dependencies.store.listMessages(
      input.conversationId,
      HISTORY_LIMIT,
    );
    const userType = this.dependencies.userTypeService.resolve(
      input.userContext,
    );
    const document = input.userId
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
      mode: input.mode ?? "CITIZEN",
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
    };
  }

  private async persistSafeReply(input: {
    conversationId: string;
    content: string;
    turnKind: PromptTurnKind;
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
  ) {
    if (!input.conversationId) {
      return this.dependencies.store.createConversation({
        userId: input.userId,
        guestSessionId: input.guestSessionId,
        title: message.slice(0, 80),
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

function retrieveRefusalMessage(
  retrieved: LegalCorpusRetrieveResult,
): string | null {
  if (retrieved.kind === "as_of_unavailable") {
    return AS_OF_UNAVAILABLE_MESSAGE;
  }
  if (retrieved.kind === "unavailable") {
    return ENGINE_UNAVAILABLE_MESSAGE;
  }
  return null;
}

function verificationRefusalMessage(verdict: LegalCitationVerdict): string | null {
  if (verdict.status === CitationVerificationStatus.CONFLICT) {
    return CONFLICT_CITATION_MESSAGE;
  }
  if (verdict.status === CitationVerificationStatus.UNRESOLVED) {
    return UNVERIFIED_CITATION_MESSAGE;
  }
  return null;
}

function toModelHistory(
  history: LegalAiStoredMessage[],
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return history.map((item) => ({
    role: item.role.toLowerCase() as "user" | "assistant" | "system",
    content: item.content,
  }));
}
