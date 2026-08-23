import { detectExactCitation } from "@/engine/citation";
import { DomainLabel } from "@/engine/gateway";
import { IntentType } from "@/engine/intent";
import {
  buildClarificationMessage,
  isLegalClarificationMessage,
} from "./legal-clarification";
import {
  hasFirstPersonProblemNarrative,
  matchNonLegalTopic,
  matchSituationSignals,
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

    const standalone = await this.classifyStandalone(message);

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
      const combined = await this.classifyStandalone(analysisText);
      if (combined.relevance === LegalRelevance.NON_LEGAL) {
        return { ...combined, analysisText };
      }
      return {
        relevance: LegalRelevance.LEGAL,
        confidence: Math.max(combined.confidence, 0.62),
        reasons: [...combined.reasons, "clarification-follow-up"],
        issueFamily: combined.issueFamily,
        analysisText,
      };
    }

    return standalone;
  }

  private async classifyStandalone(
    message: string,
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
    const situations = matchSituationSignals(message);
    const nonLegalTopic = matchNonLegalTopic(message);
    const issueFamily = situations[0]?.family;

    if (citation) {
      return finish({
        relevance: LegalRelevance.LEGAL,
        confidence: 0.95,
        reasons: ["exact-citation"],
        issueFamily: issueFamily ?? LegalIssueFamily.OTHER,
        analysisText: message,
      });
    }

    if (domain.domain === DomainLabel.LEGAL) {
      return finish({
        relevance: LegalRelevance.LEGAL,
        confidence: clamp01(domain.confidence ?? 0.7),
        reasons: ["domain-legal", ...domain.matchedRuleIds],
        issueFamily: issueFamily ?? LegalIssueFamily.OTHER,
        analysisText: message,
      });
    }

    if (situations.length > 0) {
      return finish({
        relevance: LegalRelevance.POSSIBLY_LEGAL,
        confidence: Math.min(0.82, 0.52 + situations.length * 0.1),
        reasons: situations.map((hit) => `situation:${hit.id}`),
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

    return {
      relevance: LegalRelevance.NON_LEGAL,
      confidence: 0.64,
      reasons: ["no-legal-signal"],
      analysisText: message,
    };
  }
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
