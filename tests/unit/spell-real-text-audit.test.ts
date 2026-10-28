import { describe, expect, it } from "vitest";
import { createSpellEngineV1 } from "@/spell-engine/bundled";
import audit from "../evaluation/spell-v1/gold/audit-valid-v1.json";

/**
 * Words the SHIPPING engine once wrongly flagged on real news text. They are
 * a permanent regression set: valid Mongolian must never be called wrong.
 */
describe("real-text audit regressions (REAL_TEXT_AUDIT_VALID_V1)", () => {
  const engine = createSpellEngineV1();
  it("declares provenance and an honest review status", () => {
    expect(audit.reviewStatus).toBe("PENDING_NATIVE_REVIEW");
    expect(audit.provenance).toMatch(/NOT native-reviewed/);
  });
  for (const { word } of audit.mustNotBeMisspelled) {
    it(`never flags «${word}» mid-sentence`, () => {
      const r = engine.analyze(`и ${word}`);
      expect(r.tokens[1]!.verdict).not.toBe("MISSPELLED");
      expect(r.issues).toHaveLength(0);
    });
  }
});
