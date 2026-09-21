import { describe, expect, it } from "vitest";

import {
  AuthorityPrecedenceBasis,
  AuthorityPrecedenceConfidence,
  AuthorityPrecedenceOutcome,
  GraphNodeType,
  compareAuthorityPrecedence,
  defaultAuthorityPrecedencePolicy,
} from "@/engine/graph";

describe("compareAuthorityPrecedence", () => {
  it("ranks LAW above GOVERNMENT_REGULATION under the default policy, with DEFAULT_UNVERIFIED confidence", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LAW },
      { type: GraphNodeType.GOVERNMENT_REGULATION },
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.FIRST_HIGHER);
    expect(result.basis).toBe(AuthorityPrecedenceBasis.NOMINAL_TIER);
    expect(result.confidence).toBe(AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED);
  });

  it("ranks SUPREME_COURT_RESOLUTION above an ordinary COURT_DECISION", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.SUPREME_COURT_RESOLUTION },
      { type: GraphNodeType.COURT_DECISION },
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.FIRST_HIGHER);
  });

  it("never ranks a Supreme Court resolution above LAW itself under the default policy", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.SUPREME_COURT_RESOLUTION },
      { type: GraphNodeType.LAW },
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.SECOND_HIGHER);
  });

  it("treats equal-tier authorities as EQUAL when no effective date breaks the tie", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LAW },
      { type: GraphNodeType.LAW },
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.EQUAL);
  });

  it("breaks an equal-tier tie by effective-date recency (lex posterior), flagged as an unverified default", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LAW, effectiveFrom: "2020-01-01" },
      { type: GraphNodeType.LAW, effectiveFrom: "2023-06-01" },
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.SECOND_HIGHER);
    expect(result.basis).toBe(AuthorityPrecedenceBasis.TIE_BREAK_RECENCY);
    expect(result.confidence).toBe(AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED);
  });

  it("temporal force always dominates nominal tier: a not-in-force LAW never outranks an in-force GOVERNMENT_REGULATION", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LAW, force: "NOT_IN_FORCE" },
      { type: GraphNodeType.GOVERNMENT_REGULATION, force: "IN_FORCE" },
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.SECOND_HIGHER);
    expect(result.basis).toBe(AuthorityPrecedenceBasis.TEMPORAL_STATUS);
    expect(result.confidence).toBe(AuthorityPrecedenceConfidence.HIGH);
  });

  it("falls back to nominal tier when force is UNKNOWN on both sides", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LAW, force: "UNKNOWN" },
      { type: GraphNodeType.GOVERNMENT_REGULATION, force: "UNKNOWN" },
    );
    expect(result.basis).toBe(AuthorityPrecedenceBasis.NOMINAL_TIER);
  });

  it("does not let a NOT_IN_FORCE vs NOT_IN_FORCE pair short-circuit into TEMPORAL_STATUS — falls through to nominal tier", () => {
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LAW, force: "NOT_IN_FORCE" },
      { type: GraphNodeType.GOVERNMENT_REGULATION, force: "NOT_IN_FORCE" },
    );
    expect(result.basis).toBe(AuthorityPrecedenceBasis.NOMINAL_TIER);
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.FIRST_HIGHER);
  });

  it("returns INDETERMINATE for a type with no configured tier in a custom policy", () => {
    const customPolicy = { tiers: { [GraphNodeType.LAW]: 80 } } as never;
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LAW },
      { type: GraphNodeType.GOVERNMENT_REGULATION },
      customPolicy,
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.INDETERMINATE);
    expect(result.confidence).toBe(AuthorityPrecedenceConfidence.DEFAULT_UNVERIFIED);
  });

  it("is reusable with an explicit custom policy without mutating the shared default", () => {
    const defaults = defaultAuthorityPrecedencePolicy();
    const custom = {
      tiers: { ...defaults.tiers, [GraphNodeType.LEGAL_COMMENTARY]: 999 },
    };
    const result = compareAuthorityPrecedence(
      { type: GraphNodeType.LEGAL_COMMENTARY },
      { type: GraphNodeType.LAW },
      custom,
    );
    expect(result.outcome).toBe(AuthorityPrecedenceOutcome.FIRST_HIGHER);
    // the module-level default policy must be unaffected by the custom one above
    const stillDefault = compareAuthorityPrecedence(
      { type: GraphNodeType.LEGAL_COMMENTARY },
      { type: GraphNodeType.LAW },
    );
    expect(stillDefault.outcome).toBe(AuthorityPrecedenceOutcome.SECOND_HIGHER);
  });
});
