import { describe, expect, it } from "vitest";
import { evaluateGate, THRESHOLDS, type GateMetrics } from "../../scripts/spell-data/lib/gate-core";

const m = (flagged: number, valid: number, acc: number | null = 0, words = 1_000_000): GateMetrics => ({ words, flagged, flaggedAccepted: acc, validShare: valid });

describe("clean-text regression gate (precision-first)", () => {
  it("passes a clean, low-flag engine and reports how close it is to the targets", () => {
    expect(evaluateGate(m(150, 0.75)).level).toBe("OK"); // 0.015 %
    expect(evaluateGate(m(80, 0.75)).level).toBe("TARGET"); // 0.008 %
    expect(evaluateGate(m(40, 0.75)).level).toBe("LONG_TERM"); // 0.004 %
  });
  it("fails above the 0.02 % ceiling no matter how much coverage was gained", () => {
    const r = evaluateGate(m(300, 0.99));
    expect(r.pass).toBe(false);
    expect(r.messages.join(" ")).toMatch(/ceiling/);
  });
  it("fails when flagged tokens are words an independent dictionary accepts", () => {
    expect(evaluateGate(m(100, 0.8, 120)).pass).toBe(false);
    expect(evaluateGate(m(100, 0.8, 0)).pass).toBe(true);
    expect(evaluateGate(m(100, 0.8, null)).pass).toBe(true); // no oracle: only the rate gate applies
  });
  it("a recall/coverage gain that damages precision FAILS against the baseline", () => {
    const base = m(50, 0.47);
    expect(evaluateGate(m(50, 0.74), base).pass).toBe(true);
    const worse = evaluateGate(m(50 + THRESHOLDS.maxFlagRateIncrease * 1_000_000 + 20, 0.9), base);
    expect(worse.pass).toBe(false);
    expect(worse.messages.join(" ")).toMatch(/precision damaged/);
  });
  it("coverage may not regress below the baseline either", () => {
    expect(evaluateGate(m(10, 0.4), m(10, 0.47)).pass).toBe(false);
  });
});
