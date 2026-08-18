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
  store: LegalAiStore;
  completion: LegalAiCompletionPort;
  corpusRetriever: LegalCorpusRetriever;
};

/**
 * Application adapter for TORE Legal AI chat.
 *
 * Orchestrates gateway classification, exact-citation corpus lookup,
 * official citation verification, prompt construction, OpenAI
 * completion, and persistence.
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

    const domainResult = await this.dependencies.domainFilter.classify(message);
    const isNonLegal = domainResult.domain === DomainLabel.NON_LEGAL;

    if (!isNonLegal && !this.dependencies.completion.isConfigured()) {
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

    if (isNonLegal) {
      return this.persistSafeReply({
        conversationId: conversation.id,
        content: NON_LEGAL_REFUSAL_MESSAGE,
        turnKind: PromptTurnKind.GENERAL,
      });
    }

    const history = await this.dependencies.store.listMessages(
      conversation.id,
      HISTORY_LIMIT,
    );

    const userType = this.dependencies.userTypeService.resolve(
      input.userContext,
    );
    const intent = await this.dependencies.intent.classify(message);
    const turnKind = resolveTurnKind(domainResult.domain, intent);
    const exactCitation = detectExactCitation(message);

    const verifiedResolution = exactCitation
      ? await this.resolveVerifiedAuthorities({
          question: message,
          query: exactCitation.query,
          locator: exactCitation.locator,
        })
      : { kind: "skipped" as const };

    if (verifiedResolution.kind === "refused") {
      return this.persistSafeReply({
        conversationId: conversation.id,
        content: verifiedResolution.message,
        turnKind,
      });
    }

    const verifiedAuthorities =
      verifiedResolution.kind === "verified"
        ? verifiedResolution.authorities
        : undefined;

    const reasoningPlan = this.prepareReasoningPlan(message, intent);

    const prompt = this.dependencies.promptBuilder.build({
  message,
  userType,
  domain: domainResult.domain,
  turnKind,
  mode: input.mode ?? "CITIZEN",
  intentType: intent.intent,
  intentConfidence: intent.confidence,
  missingInformation: verifiedAuthorities?.length
    ? undefined
    : reasoningPlan?.missingInformation,
  corpusAvailable: Boolean(verifiedAuthorities?.length),
  verifiedAuthorities,
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

    if (verifiedAuthorities?.length) {
      await this.dependencies.store.createCitations({
        messageId: assistantMessage.id,
        citations: verifiedAuthorities.map((authority) => ({
          title: authority.title,
          sourceType: VERIFIED_SOURCE_TYPE,
          sourceUrl: null,
          reference: [
            authority.locator,
            authority.documentId,
            authority.documentVersionId,
            authority.nodeId,
          ].join(" | "),
          excerpt: authority.excerpt,
        })),
      });
    }

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
      authorities: verified.map((authority) => ({
        title: authority.title,
        locator: authority.locator,
        excerpt: authority.excerpt,
        documentId: authority.documentId,
        documentVersionId: authority.documentVersionId,
        nodeId: authority.nodeId,
        effectiveFrom: authority.effectiveFrom,
        effectiveTo: authority.effectiveTo,
      })),
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
      message: assistantMessage,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      turnKind: input.turnKind,
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
