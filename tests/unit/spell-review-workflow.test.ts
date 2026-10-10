import { describe, expect, it } from "vitest";
import { buildGold, consensus, type ReviewRow } from "../../scripts/spell-data/lib/review-core";

const row = (reviewer: string, kind: ReviewRow["reviewerKind"], verdict: ReviewRow["verdict"], best?: string, date = "2026-10-07"): ReviewRow => ({ id: "x", reviewer, reviewerKind: kind, verdict, best, date });

describe("human review consensus (the rules that stop an AI or a single opinion becoming «truth»)", () => {
  it("an AI judgment alone is never gold", () => {
    expect(consensus("x", [row("claude", "AI_ASSISTANT", "VALID")]).status).toBe("AI_ONLY");
    expect(consensus("x", [row("claude", "AI_ASSISTANT", "VALID"), row("claude2", "AI_ASSISTANT", "VALID")]).status).toBe("AI_ONLY");
  });
  it("one human is pending, even with an AI that agrees", () => {
    expect(consensus("x", [row("anu", "HUMAN_NATIVE", "VALID"), row("claude", "AI_ASSISTANT", "VALID")]).status).toBe("PENDING");
  });
  it("two native reviewers who agree → NATIVE_REVIEWED; two non-native → AGREED_NON_NATIVE only", () => {
    expect(consensus("x", [row("anu", "HUMAN_NATIVE", "MISSPELLED", "хууль"), row("bold", "HUMAN_NATIVE", "MISSPELLED", "хууль")]).status).toBe("NATIVE_REVIEWED");
    expect(consensus("x", [row("anu", "HUMAN_NATIVE", "VALID"), row("eve", "HUMAN_OTHER", "VALID")]).status).toBe("AGREED_NON_NATIVE");
  });
  it("disagreement (verdict or best suggestion) is DISPUTED and keeps both opinions", () => {
    const c = consensus("x", [row("anu", "HUMAN_NATIVE", "MISSPELLED", "хууль"), row("bold", "HUMAN_NATIVE", "MISSPELLED", "хуулийн")]);
    expect(c.status).toBe("DISPUTED");
    expect(c.reviewers).toHaveLength(2);
    expect(consensus("x", [row("anu", "HUMAN_NATIVE", "VALID"), row("bold", "HUMAN_NATIVE", "UNKNOWN")]).status).toBe("DISPUTED");
  });
  it("the same person twice is one reviewer; a correction replaces their earlier answer", () => {
    expect(consensus("x", [row("anu", "HUMAN_NATIVE", "VALID", undefined, "2026-10-01"), row("anu", "HUMAN_NATIVE", "VALID", undefined, "2026-10-02")]).status).toBe("PENDING");
    const c = consensus("x", [row("anu", "HUMAN_NATIVE", "VALID", undefined, "2026-10-01"), row("anu", "HUMAN_NATIVE", "UNKNOWN", undefined, "2026-10-03"), row("bold", "HUMAN_NATIVE", "UNKNOWN")]);
    expect(c.status).toBe("NATIVE_REVIEWED");
    expect(c.verdict).toBe("UNKNOWN");
  });
  it("gold keeps only agreed items; disputed/pending/AI are excluded and counted", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id, token: id, context: "", source: "s", reason: "r" }));
    const cs = [
      consensus("a", [{ ...row("anu", "HUMAN_NATIVE", "MISSPELLED", "хууль"), id: "a" }, { ...row("bold", "HUMAN_NATIVE", "MISSPELLED", "хууль"), id: "a" }]),
      consensus("b", [{ ...row("anu", "HUMAN_NATIVE", "VALID"), id: "b" }, { ...row("bold", "HUMAN_NATIVE", "UNKNOWN"), id: "b" }]),
      consensus("c", [{ ...row("claude", "AI_ASSISTANT", "VALID"), id: "c" }]),
      consensus("d", []),
    ];
    const g = buildGold(items, cs, "2026-10-07");
    expect(g.invalid.map((r) => r.id)).toEqual(["a"]);
    expect(g.suggestions[0]!.expectedSuggestion).toBe("хууль");
    expect(g.suggestions[0]!.reviewStatus).toBe("NATIVE_REVIEWED");
    expect(g.disputed).toEqual(["b"]);
    expect(g.excluded).toEqual({ pending: 1, aiOnly: 1 });
    expect(g.valid).toEqual([]);
  });
});
