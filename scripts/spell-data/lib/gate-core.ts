/**
 * Hard quality gates (pure). A gate failure means a change is REJECTED regardless of what it gained: a recall or coverage
 * improvement that damages precision must fail.
 */
export type GateMetrics = {
  /** word tokens measured */
  words: number;
  /** tokens the engine called MISSPELLED on text that is (modulo real typos) clean */
  flagged: number;
  /** of those, tokens an independent dictionary accepts (false-accusation candidates); null if no oracle was available */
  flaggedAccepted: number | null;
  validShare: number;
};

export const THRESHOLDS = {
  /** start: ≤ 0.02 % of clean-corpus tokens flagged; target 0.01 %; long term 0.005 % */
  maxFlagRate: 0.0002,
  targetFlagRate: 0.0001,
  longTermFlagRate: 0.00005,
  /** a new engine may not flag more than the baseline by more than this absolute rate */
  maxFlagRateIncrease: 0.00005,
  /** a new engine may not cover less than the baseline */
  minValidShareDelta: 0,
} as const;

export type GateResult = { pass: boolean; level: "FAIL" | "OK" | "TARGET" | "LONG_TERM"; messages: string[] };

export function evaluateGate(m: GateMetrics, baseline?: GateMetrics): GateResult {
  const messages: string[] = [];
  const rate = m.flagged / Math.max(m.words, 1);
  let pass = true;
  if (rate > THRESHOLDS.maxFlagRate) {
    pass = false;
    messages.push(`flag rate ${(rate * 100).toFixed(4)} % exceeds the ${(THRESHOLDS.maxFlagRate * 100).toFixed(3)} % ceiling`);
  }
  if (m.flaggedAccepted !== null && m.flaggedAccepted > 0 && m.flaggedAccepted / m.words > THRESHOLDS.longTermFlagRate) {
    pass = false;
    messages.push(`${m.flaggedAccepted} flagged tokens are accepted by the independent dictionary (${((m.flaggedAccepted / m.words) * 100).toFixed(4)} %) — false-accusation candidates`);
  }
  if (baseline) {
    const brate = baseline.flagged / Math.max(baseline.words, 1);
    if (rate > brate + THRESHOLDS.maxFlagRateIncrease) {
      pass = false;
      messages.push(`flag rate rose from ${(brate * 100).toFixed(4)} % to ${(rate * 100).toFixed(4)} % (baseline): precision damaged`);
    }
    if (m.validShare < baseline.validShare + THRESHOLDS.minValidShareDelta) {
      pass = false;
      messages.push(`valid-token coverage fell below the baseline (${(m.validShare * 100).toFixed(2)} % < ${(baseline.validShare * 100).toFixed(2)} %)`);
    }
  }
  const level = !pass ? "FAIL" : rate <= THRESHOLDS.longTermFlagRate ? "LONG_TERM" : rate <= THRESHOLDS.targetFlagRate ? "TARGET" : "OK";
  return { pass, level, messages };
}
