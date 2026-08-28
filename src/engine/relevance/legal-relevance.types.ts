/**
 * Contracts for TORE legal-relevance detection.
 *
 * This layer sits above DomainFilter and IntentService. Those engines
 * remain signals — they are not the final legal / non-legal decision.
 * IntentType is also not the full universe of legal issues.
 */

import type { LegalQuestionStatus } from "@/domain/enums";
import type { IDomainFilter } from "@/engine/gateway";
import type { IntentService } from "@/engine/intent";

export const LegalRelevance = {
  LEGAL: "LEGAL",
  POSSIBLY_LEGAL: "POSSIBLY_LEGAL",
  NON_LEGAL: "NON_LEGAL",
} as const;

export type LegalRelevance =
  (typeof LegalRelevance)[keyof typeof LegalRelevance];

/**
 * Coarse issue families used only to phrase a clarification.
 * Broader than IntentType, and kept open for tax, IP, traffic,
 * consumer, and other areas the intent engine does not yet name.
 */
export const LegalIssueFamily = {
  CRIMINAL: "CRIMINAL",
  CIVIL: "CIVIL",
  FAMILY: "FAMILY",
  EMPLOYMENT: "EMPLOYMENT",
  ADMINISTRATIVE: "ADMINISTRATIVE",
  CONTRACT: "CONTRACT",
  CORPORATE: "CORPORATE",
  PROPERTY: "PROPERTY",
  INHERITANCE: "INHERITANCE",
  TAX: "TAX",
  CONSUMER: "CONSUMER",
  INTELLECTUAL_PROPERTY: "INTELLECTUAL_PROPERTY",
  LICENSING: "LICENSING",
  REGULATORY: "REGULATORY",
  TRAFFIC: "TRAFFIC",
  OTHER: "OTHER",
} as const;

export type LegalIssueFamily =
  (typeof LegalIssueFamily)[keyof typeof LegalIssueFamily];

export type LegalRelevanceConversationMessage = {
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
};

export type LegalRelevanceInput = {
  message: string;
  conversationContext?: readonly LegalRelevanceConversationMessage[];
  /** When the thread is mid-clarification, follow-ups stay in the legal pipeline. */
  questionStatus?: LegalQuestionStatus;
};

export type LegalRelevanceResult = {
  relevance: LegalRelevance;
  confidence: number;
  reasons: string[];
  issueFamily?: LegalIssueFamily;
  clarificationMessage?: string;
  /** Text the rest of the pipeline should classify when following up. */
  analysisText: string;
};

export type LegalRelevanceDependencies = {
  domainFilter: IDomainFilter;
  intent: IntentService;
};
