/**
 * Contracts for the TORE Legal AI Intent Engine.
 *
 * This is the stable public boundary. Application adapters and a future
 * model-backed classifier must speak these types so {@link IntentService}
 * does not change when the scoring backend is replaced.
 */

/**
 * Supported user intents. `UNKNOWN` is the safe default when no rule
 * (or later, no model class) is confident.
 */
export const IntentType = {
  UNKNOWN: "UNKNOWN",
  LEGAL_INFORMATION: "LEGAL_INFORMATION",
  LEGAL_RESEARCH: "LEGAL_RESEARCH",
  CASE_ANALYSIS: "CASE_ANALYSIS",
  DOCUMENT_REVIEW: "DOCUMENT_REVIEW",
  CONTRACT_REVIEW: "CONTRACT_REVIEW",
  DOCUMENT_DRAFTING: "DOCUMENT_DRAFTING",
  COMPANY_FORMATION: "COMPANY_FORMATION",
  EMPLOYMENT_DISPUTE: "EMPLOYMENT_DISPUTE",
  FAMILY_LAW: "FAMILY_LAW",
  CRIMINAL_LAW: "CRIMINAL_LAW",
  CIVIL_LAW: "CIVIL_LAW",
  ADMINISTRATIVE_LAW: "ADMINISTRATIVE_LAW",
} as const;

export type IntentType = (typeof IntentType)[keyof typeof IntentType];

/**
 * How an intent decision was produced. Rule-based today; a classifier
 * model reports `model` without changing {@link IntentClassification}.
 */
export type IntentClassificationMethod = "rule" | "model";

/**
 * One expandable matching rule used by the rule-based classifier.
 * Model backends do not need this type.
 */
export type IntentRule = {
  /** Stable identifier for logs, tests, and training labels. */
  id: string;
  /** Intent assigned when the rule matches. */
  intent: IntentType;
  /**
   * Relative strength of this signal. Higher values beat generic
   * `LEGAL_INFORMATION` when several intents fire.
   */
  weight: number;
  /** Return true when the normalized user message matches. */
  test: (normalizedMessage: string) => boolean;
};

/**
 * Public classification result. This shape is the API that must remain
 * stable when swapping {@link IIntentClassifier} implementations.
 */
export type IntentClassification = {
  intent: IntentType;
  /** Score in `[0, 1]`. */
  confidence: number;
  /** Rule ids (or model label ids) that supported the winning intent. */
  matchedRules: string[];
};

/** Optional extras for logs; not required by the public return contract. */
export type IntentClassificationDetails = IntentClassification & {
  method: IntentClassificationMethod;
};

/**
 * Port: classify a user message into an {@link IntentType}.
 *
 * Inject a model-backed implementation with the same method signature
 * to replace rule-based scoring without changing {@link IntentService}.
 */
export interface IIntentClassifier {
  classify(
    message: string,
  ): IntentClassification | Promise<IntentClassification>;
}

/** Constructor dependencies for {@link IntentService}. */
export type IntentServiceDependencies = {
  classifier: IIntentClassifier;
};
