import { describe, expect, it } from "vitest";

import type { OrthographySuggestionView } from "@/components/orthography/orthography-checker";
import {
  findActiveRangeIndex,
  rangesForText,
} from "@/components/orthography/spellcheck-textarea";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";

function suggestion(
  overrides: Partial<OrthographySuggestionView> &
    Pick<OrthographySuggestionView, "sourceWord" | "start" | "end">,
): OrthographySuggestionView {
  return {
    kind: "SPELLING",
    suggestedWord: overrides.sourceWord,
    suggestionLabel: "",
    ruleIds: [],
    ruleTitle: null,
    ...overrides,
  };
}

describe("SpellcheckTextarea inline click/popup logic", () => {
  it("opens the popup for exactly the token the caret is on, independent of other flagged tokens", () => {
    // "aaa BBB ccc" — two unrelated flagged spans.
    const text = "aaa BBB ccc";
    const a = suggestion({ sourceWord: "aaa", start: 0, end: 3, suggestedWord: "AAA" });
    const b = suggestion({ sourceWord: "ccc", start: 8, end: 11, suggestedWord: "CCC" });
    const ranges = rangesForText(text, [a, b]);

    expect(findActiveRangeIndex(ranges, 1)).toBe(0); // caret inside "aaa"
    expect(findActiveRangeIndex(ranges, 9)).toBe(1); // caret inside "ccc"
    expect(findActiveRangeIndex(ranges, 5)).toBeNull(); // caret on "BBB" — not flagged
  });

  it("keeps each flagged span's own candidates isolated from the others", () => {
    const text = "ширэх ба хунэтаи";
    const result = buildOrthographySuggestions(text);
    const ranges = rangesForText(text, result.suggestions);
    expect(ranges.length).toBeGreaterThanOrEqual(2);

    const shirekh = ranges.find((item) => item.sourceWord === "ширэх");
    const khuntei = ranges.find((item) => item.sourceWord === "хунэтаи");
    expect(shirekh?.suggestedWord).toBe("ширхэг");
    expect(khuntei?.suggestedWord).toBe("хүнтэй");
    // Neither span's candidate list leaks the other word's correction.
    expect(shirekh?.candidates ?? []).not.toContain("хүнтэй");
    expect(khuntei?.candidates ?? []).not.toContain("ширхэг");
  });

  it("only surfaces spans with a valid, in-bounds range for the current text", () => {
    const text = "abc";
    const outOfBounds = suggestion({ sourceWord: "zzz", start: 10, end: 13, suggestedWord: "zzz" });
    const valid = suggestion({ sourceWord: "abc", start: 0, end: 3, suggestedWord: "abc" });
    const ranges = rangesForText(text, [outOfBounds, valid]);
    expect(ranges).toEqual([valid]);
  });
});
