import { describe, expect, it } from "vitest";
import { buildHunspellWordSuggestions } from "@/domain/mongolian-orthography/hunspell-server";

describe("Mongolian Hunspell spellcheck", () => {
  it("does not flag correctly spelled legal words", () => {
    const result = buildHunspellWordSuggestions(
      "Эрүүгийн хэргийг анхан шатны шүүх хянан шийдвэрлэнэ.",
    );

    expect(result.map((item) => item.sourceWord)).not.toContain("анхан");
    expect(result.map((item) => item.sourceWord)).not.toContain("шатны");
    expect(result.map((item) => item.sourceWord)).not.toContain("шүүх");
  });

  it("returns real spelling candidates for an obvious typo", () => {
    const result = buildHunspellWordSuggestions("хүнэтаи");
    const item = result.find((candidate) => candidate.sourceWord === "хүнэтаи");

    expect(item).toBeDefined();
    expect(item?.candidates.length).toBeGreaterThan(0);
    expect(item?.suggestedWord).toBe("хүнтэй");
  });
});
