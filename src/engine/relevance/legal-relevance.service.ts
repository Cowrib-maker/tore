import { LegalQuestionStatus } from "@/domain/enums";
import { detectExactCitation } from "@/engine/citation";
import { DomainLabel } from "@/engine/gateway";
import { IntentType } from "@/engine/intent";
import {
  buildClarificationMessage,
  isLegalClarificationMessage,
} from "./legal-clarification";
import { detectForeignLegalScope } from "./foreign-legal-scope";
import {
  analyzeLegalFactContext,
  hasFirstPersonProblemNarrative,
  matchNonLegalTopic,
} from "./legal-situation-signals";
import {
  LegalIssueFamily,
  LegalRelevance,
  type LegalRelevanceDependencies,
  type LegalRelevanceInput,
  type LegalRelevanceResult,
} from "./legal-relevance.types";

const LEGAL_INTENT_CONFIDENCE_FLOOR = 0.5;

const LEGAL_INTENTS = new Set<string>([
  IntentType.LEGAL_INFORMATION,
  IntentType.LEGAL_RESEARCH,
  IntentType.CASE_ANALYSIS,
  IntentType.DOCUMENT_REVIEW,
  IntentType.CONTRACT_REVIEW,
  IntentType.DOCUMENT_DRAFTING,
  IntentType.COMPANY_FORMATION,
  IntentType.EMPLOYMENT_DISPUTE,
  IntentType.FAMILY_LAW,
  IntentType.CRIMINAL_LAW,
  IntentType.CIVIL_LAW,
  IntentType.ADMINISTRATIVE_LAW,
]);

/**
 * Deterministic legal-relevance detector.
 *
 * DomainFilter keyword misses are not treated as NON_LEGAL.
 * Intent UNKNOWN is not treated as NON_LEGAL.
 * Does not call a language model.
 */
export class LegalRelevanceService {
  constructor(private readonly dependencies: LegalRelevanceDependencies) {}

  async classify(input: LegalRelevanceInput): Promise<LegalRelevanceResult> {
    const message = input.message.trim();
    const context = input.conversationContext ?? [];
    const lastAssistant = lastMessageWithRole(context, "ASSISTANT");
    const followingUp =
      Boolean(lastAssistant) &&
      isLegalClarificationMessage(lastAssistant?.content ?? "");

    if (
      input.questionStatus === LegalQuestionStatus.CLARIFYING &&
      context.length > 0
    ) {
      return this.classifyClarifyingContinuation(
        message,
        context,
        input.audience,
      );
    }

    const standalone = await this.classifyStandalone(message, input.audience);

    if (followingUp) {
      if (
        standalone.relevance === LegalRelevance.NON_LEGAL &&
        standalone.reasons.some((reason) =>
          reason.startsWith("non-legal-topic:"),
        )
      ) {
        return { ...standalone, analysisText: message };
      }

      const priorUsers = context
        .filter((item) => item.role === "USER")
        .map((item) => item.content.trim())
        .filter(Boolean);
      const analysisText = [...priorUsers.slice(-3), message].join("\n");
      const combined = await this.classifyStandalone(
        analysisText,
        input.audience,
      );
      if (combined.relevance === LegalRelevance.NON_LEGAL) {
        return applyLawyerAudience(input.audience, {
          ...combined,
          analysisText,
        });
      }
      return applyLawyerAudience(input.audience, {
        relevance: LegalRelevance.LEGAL,
        confidence: Math.max(combined.confidence, 0.62),
        reasons: [...combined.reasons, "clarification-follow-up"],
        issueFamily: combined.issueFamily,
        analysisText,
      });
    }

    return applyLawyerAudience(input.audience, standalone);
  }

  private async classifyClarifyingContinuation(
    message: string,
    context: NonNullable<LegalRelevanceInput["conversationContext"]>,
    audience: LegalRelevanceInput["audience"] = "CITIZEN",
  ): Promise<LegalRelevanceResult> {
    const standalone = await this.classifyStandalone(message, audience);
    if (
      standalone.relevance === LegalRelevance.NON_LEGAL &&
      standalone.reasons.some((reason) => reason.startsWith("non-legal-topic:"))
    ) {
      return { ...standalone, analysisText: message };
    }

    const priorUsers = context
      .filter((item) => item.role === "USER")
      .map((item) => item.content.trim())
      .filter(Boolean);
    const analysisText = [...priorUsers.slice(-3), message].join("\n");
    const combined = await this.classifyStandalone(analysisText, audience);
    if (
      combined.relevance === LegalRelevance.NON_LEGAL &&
      combined.reasons.some((reason) => reason.startsWith("non-legal-topic:"))
    ) {
      return { ...combined, analysisText };
    }

    return applyLawyerAudience(audience, {
      relevance: LegalRelevance.LEGAL,
      confidence: Math.max(combined.confidence, 0.65),
      reasons: [...combined.reasons, "clarifying-thread-continuation"],
      issueFamily: combined.issueFamily,
      analysisText,
    });
  }

  private async classifyStandalone(
    message: string,
    audience: LegalRelevanceInput["audience"] = "CITIZEN",
  ): Promise<LegalRelevanceResult> {
    if (!message.trim()) {
      return {
        relevance: LegalRelevance.NON_LEGAL,
        confidence: 1,
        reasons: ["empty"],
        analysisText: message,
      };
    }

    const citation = detectExactCitation(message);
    const domain = await this.dependencies.domainFilter.classify(message);
    const factContext = analyzeLegalFactContext(message);
    const situations = factContext.situations;
    const nonLegalTopic = matchNonLegalTopic(message);
    const issueFamily = situations[0]?.family;
    const detachedWithoutFacts =
      factContext.detachedMention && situations.length === 0;

    if (citation) {
      return finish({
        relevance: LegalRelevance.LEGAL,
        confidence: 0.95,
        reasons: ["exact-citation"],
        issueFamily: issueFamily ?? LegalIssueFamily.OTHER,
        analysisText: message,
      });
    }

    const foreignScope = detectForeignLegalScope(message);
    if (foreignScope && !nonLegalTopic) {
      return finish({
        relevance: LegalRelevance.LEGAL,
        confidence: 0.84,
        reasons: [
          "foreign-legal-scope",
          ...foreignScope.labels.map((label) => `foreign:${label}`),
        ],
        issueFamily: issueFamily ?? LegalIssueFamily.OTHER,
        analysisText: message,
      });
    }

    if (domain.domain === DomainLabel.LEGAL && !detachedWithoutFacts) {
      return finish({
        relevance: LegalRelevance.LEGAL,
        confidence: clamp01(domain.confidence ?? 0.7),
        reasons: ["domain-legal", ...domain.matchedRuleIds],
        issueFamily: issueFamily ?? LegalIssueFamily.OTHER,
        analysisText: message,
      });
    }

    if (situations.length > 0) {
      const relevance = relevanceFromFactDimensions(factContext.dimensions);
      return finish({
        relevance,
        confidence: Math.min(
          relevance === LegalRelevance.LEGAL ? 0.88 : 0.82,
          0.52 + situations.length * 0.1,
        ),
        reasons: [
          ...situations.map((hit) => `situation:${hit.id}`),
          ...(relevance === LegalRelevance.LEGAL ? ["fact-context"] : []),
        ],
        issueFamily,
        analysisText: message,
      });
    }

    if (nonLegalTopic) {
      return {
        relevance: LegalRelevance.NON_LEGAL,
        confidence: 0.86,
        reasons: [`non-legal-topic:${nonLegalTopic}`],
        analysisText: message,
      };
    }

    if (hasFirstPersonProblemNarrative(message)) {
      return finish({
        relevance: LegalRelevance.POSSIBLY_LEGAL,
        confidence: 0.58,
        reasons: ["first-person-problem"],
        issueFamily: LegalIssueFamily.OTHER,
        analysisText: message,
      });
    }

    const intent = await this.dependencies.intent.classify(message);
    if (
      LEGAL_INTENTS.has(intent.intent) &&
      intent.confidence >= LEGAL_INTENT_CONFIDENCE_FLOOR
    ) {
      return finish({
        relevance: LegalRelevance.LEGAL,
        confidence: intent.confidence,
        reasons: ["intent-legal", intent.intent, ...intent.matchedRules],
        issueFamily: issueFamily ?? LegalIssueFamily.OTHER,
        analysisText: message,
      });
    }

    return applyLawyerAudience(audience, {
      relevance: LegalRelevance.NON_LEGAL,
      confidence: 0.64,
      reasons: ["no-legal-signal"],
      analysisText: message,
    });
  }
}

function applyLawyerAudience(
  audience: LegalRelevanceInput["audience"],
  result: LegalRelevanceResult,
): LegalRelevanceResult {
  if (audience !== "LAWYER") {
    return result;
  }
  if (result.reasons.some((reason) => reason.startsWith("non-legal-topic:"))) {
    return result;
  }
  if (result.relevance === LegalRelevance.POSSIBLY_LEGAL) {
    return {
      ...result,
      relevance: LegalRelevance.LEGAL,
      reasons: [...result.reasons, "lawyer-do-the-work"],
    };
  }
  if (
    result.relevance === LegalRelevance.NON_LEGAL &&
    result.reasons.includes("no-legal-signal") &&
    looksLikeLawyerAssignment(result.analysisText)
  ) {
    return {
      ...result,
      relevance: LegalRelevance.LEGAL,
      confidence: Math.max(result.confidence, 0.7),
      reasons: [...result.reasons, "lawyer-all-areas"],
      issueFamily: result.issueFamily ?? LegalIssueFamily.OTHER,
    };
  }
  return result;
}

function looksLikeLawyerAssignment(text: string): boolean {
  return /шинжил|ноорог|даалгавар|бэлтгэ|мемо\b|memo\b|draft\b|brief\b|\banaly[sz]e\b|research\b|due diligence|opinion letter|харьцуул|зөвлөмж бэлтгэ|эрх зүйн дүгнэлт/i.test(
    text,
  );
}

function finish(result: LegalRelevanceResult): LegalRelevanceResult {
  if (result.relevance !== LegalRelevance.POSSIBLY_LEGAL) {
    return result;
  }
  return {
    ...result,
    clarificationMessage: buildClarificationMessage(result.issueFamily),
  };
}

function relevanceFromFactDimensions(
  dimensions: readonly string[],
): (typeof LegalRelevance)[keyof typeof LegalRelevance] {
  const set = new Set(dimensions);
  if (set.has("procedure") && (set.has("harm") || set.has("status"))) {
    return LegalRelevance.LEGAL;
  }
  return LegalRelevance.POSSIBLY_LEGAL;
}

function lastMessageWithRole(
  messages: readonly { role: string; content: string }[],
  role: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === role) {
      return messages[index];
    }
  }
  return undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
