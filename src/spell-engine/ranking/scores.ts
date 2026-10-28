import type { SpellEngineV1 } from "../core/engine";
import { normalizeToken } from "../tokenizer/normalize";
import type { ScoreBreakdown } from "../diagnostics/types";
import { editCost } from "./rank";

/**
 * Explainable candidate scoring. Every component is 0..1 and individually inspectable; `combined` is a fixed weighted
 * mean over the components that HAVE data (a missing frequency table or context model is reported as null and does not
 * drag the score down or up). The weights are policy, not learning: change them only with benchmark evidence.
 */
export const SCORE_WEIGHTS = { lexical: 0.25, morphology: 0.15, frequency: 0.15, errorModel: 0.3, domain: 0.05, context: 0.1 } as const;

export function scoreCandidate(engine: SpellEngineV1, typedKey: string, candidate: string, context: number | null = null): ScoreBreakdown {
  const key = normalizeToken(candidate);
  const entries = engine.lexicon.lookup(key);
  const lexical = entries.some((e) => e.conf !== "LOW") ? 1 : entries.length > 0 ? 0.7 : 0;
  const morphology = lexical === 0 && engine.morphology.analyze(key).parses.length > 0 ? 1 : lexical > 0 ? 0.8 : 0;
  const freqRaw = entries.reduce((m, e) => Math.max(m, e.freq), 0);
  const frequency = freqRaw > 1 ? Math.min(1, Math.log10(freqRaw) / 4) : null;
  const errorModel = Math.exp(-editCost(typedKey, key));
  const layers = entries.map((e) => e.layer);
  const domain = layers.includes("GENERAL") || layers.length === 0 ? 1 : 0.85;
  const parts: [number | null, number][] = [
    [lexical, SCORE_WEIGHTS.lexical],
    [morphology, SCORE_WEIGHTS.morphology],
    [frequency, SCORE_WEIGHTS.frequency],
    [errorModel, SCORE_WEIGHTS.errorModel],
    [domain, SCORE_WEIGHTS.domain],
    [context, SCORE_WEIGHTS.context],
  ];
  let num = 0;
  let den = 0;
  for (const [v, w] of parts) if (v !== null) (num += v * w, (den += w));
  const r2 = (x: number) => Math.round(x * 1000) / 1000;
  return { lexical: r2(lexical), morphology: r2(morphology), frequency: frequency === null ? null : r2(frequency), errorModel: r2(errorModel), domain, context: context === null ? null : r2(context), combined: r2(den ? num / den : 0) };
}
