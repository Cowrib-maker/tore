/**
 * TORE Legal AI Intent Engine.
 *
 * Public surface for application adapters. Depend on {@link IntentService}
 * and {@link createIntentEngine} — do not construct classifiers in routes.
 */

import { RuleBasedIntentClassifier, IntentService } from "./intent.service";
import type { IIntentClassifier, IntentServiceDependencies } from "./intent.types";

export { IntentType } from "./intent.types";
export type {
  IIntentClassifier,
  IntentClassification,
  IntentClassificationDetails,
  IntentClassificationMethod,
  IntentRule,
  IntentServiceDependencies,
} from "./intent.types";

export {
  DEFAULT_INTENT_RULES,
  INTENT_SPECIFICITY,
  createIntentTermRules,
  normalizeIntentMessage,
} from "./intent-rules";
export { IntentService, RuleBasedIntentClassifier } from "./intent.service";

/**
 * Composition root for the default production wiring.
 *
 * Pass `classifier` to substitute a model-backed {@link IIntentClassifier}
 * without changing {@link IntentService.classify}.
 */
export function createIntentEngine(
  overrides: Partial<IntentServiceDependencies> = {},
): IntentService {
  const classifier: IIntentClassifier =
    overrides.classifier ?? new RuleBasedIntentClassifier();
  return new IntentService({ classifier });
}
