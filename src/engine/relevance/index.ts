/**
 * TORE legal-relevance layer.
 *
 * Public surface for the application adapter. DomainFilter and
 * IntentService stay in place; this engine decides LEGAL /
 * POSSIBLY_LEGAL / NON_LEGAL on top of them.
 */

import { RuleBasedDomainFilter } from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { LegalRelevanceService } from "./legal-relevance.service";
import type { LegalRelevanceDependencies } from "./legal-relevance.types";

export {
  LegalIssueFamily,
  LegalRelevance,
} from "./legal-relevance.types";
export type {
  LegalRelevanceConversationMessage,
  LegalRelevanceDependencies,
  LegalRelevanceInput,
  LegalRelevanceResult,
} from "./legal-relevance.types";

export { LegalRelevanceService } from "./legal-relevance.service";
export {
  buildClarificationMessage,
  clarificationContainsForbiddenJargon,
  isLegalClarificationMessage,
  LEGAL_CLARIFICATION_PREFIX,
} from "./legal-clarification";
export {
  analyzeLegalFactContext,
  hasFirstPersonProblemNarrative,
  isDetachedLegalMention,
  matchNonLegalTopic,
  matchSituationSignals,
  stripColloquialAspect,
} from "./legal-situation-signals";

export function createLegalRelevanceEngine(
  overrides: Partial<LegalRelevanceDependencies> = {},
): LegalRelevanceService {
  return new LegalRelevanceService({
    domainFilter: overrides.domainFilter ?? new RuleBasedDomainFilter(),
    intent: overrides.intent ?? createIntentEngine(),
  });
}
