import {
  DEFAULT_INTENT_RULES,
  INTENT_SPECIFICITY,
  normalizeIntentMessage,
} from "./intent-rules";
import {
  IntentType,
  type IIntentClassifier,
  type IntentClassification,
  type IntentRule,
  type IntentServiceDependencies,
} from "./intent.types";

/**
 * Production Intent Engine.
 *
 * Single responsibility: expose {@link IntentService.classify} as the
 * stable public API. Scoring is delegated to {@link IIntentClassifier}
 * so a model-backed classifier can be injected later without changing
 * callers.
 */
export class IntentService {
  private readonly classifier: IIntentClassifier;

  constructor(dependencies: IntentServiceDependencies) {
    this.classifier = dependencies.classifier;
  }

  /**
   * Classifies a user message into an {@link IntentType}.
   *
   * @param message - Raw user text. Empty input yields `UNKNOWN`.
   * @returns `intent`, `confidence` in `[0, 1]`, and `matchedRules`.
   */
  async classify(message: string): Promise<IntentClassification> {
    return this.classifier.classify(message);
  }
}

/**
 * Default {@link IIntentClassifier}: weighted phrase rules.
 *
 * Replace this class (keep the interface) when an AI classifier is ready.
 */
export class RuleBasedIntentClassifier implements IIntentClassifier {
  constructor(
    private readonly rules: readonly IntentRule[] = DEFAULT_INTENT_RULES,
  ) {}

  /**
   * Returns a new classifier that keeps existing rules and appends `rules`.
   * Prefer this over mutating a shared instance.
   */
  withRules(rules: readonly IntentRule[]): RuleBasedIntentClassifier {
    return new RuleBasedIntentClassifier([...this.rules, ...rules]);
  }

  classify(message: string): IntentClassification {
    const normalized = normalizeIntentMessage(message);
    if (!normalized) {
      return unknownResult([]);
    }

    const hits = this.rules.filter((rule) => rule.test(normalized));
    if (hits.length === 0) {
      return unknownResult([]);
    }

    const scores = new Map<IntentType, number>();
    for (const rule of hits) {
      scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
    }

    const winner = selectWinner(scores);
    const matchedRules = hits
      .filter((rule) => rule.intent === winner)
      .map((rule) => rule.id);
    const winnerScore = scores.get(winner) ?? 0;
    const runnerUpScore = runnerUp(scores, winner);

    return {
      intent: winner,
      confidence: confidenceFromScores(winnerScore, runnerUpScore),
      matchedRules,
    };
  }
}

function unknownResult(matchedRules: string[]): IntentClassification {
  return {
    intent: IntentType.UNKNOWN,
    confidence: 0,
    matchedRules,
  };
}

function selectWinner(scores: Map<IntentType, number>): IntentType {
  let winner: IntentType = IntentType.UNKNOWN;
  let bestScore = -1;
  let bestSpecificity = -1;

  for (const [intent, score] of scores) {
    const specificity = INTENT_SPECIFICITY[intent];
    const isBetterScore = score > bestScore;
    const isBetterTie =
      score === bestScore && specificity > bestSpecificity;
    if (isBetterScore || isBetterTie) {
      winner = intent;
      bestScore = score;
      bestSpecificity = specificity;
    }
  }

  return winner;
}

function runnerUp(scores: Map<IntentType, number>, winner: IntentType): number {
  let second = 0;
  for (const [intent, score] of scores) {
    if (intent !== winner && score > second) {
      second = score;
    }
  }
  return second;
}

function confidenceFromScores(winnerScore: number, runnerUpScore: number): number {
  if (winnerScore <= 0) {
    return 0;
  }
  const margin = winnerScore / (winnerScore + runnerUpScore + 1);
  const magnitude = Math.min(1, 0.45 + winnerScore * 0.12);
  return Number(Math.min(1, 0.35 * margin + 0.65 * magnitude).toFixed(4));
}
