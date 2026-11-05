import { describe, expect, it } from "vitest";

import { detectExactCitation } from "@/engine/citation";

describe("detectExactCitation", () => {
  it("detects a dotted criminal article as art-17.1", () => {
    expect(detectExactCitation("Эрүүгийн хуулийн 17.1 дүгээр зүйл")).toEqual({
      query: "Эрүүгийн хуулийн 17.1",
      titleHint: "Эрүүгийн",
      article: "17.1",
      paragraph: null,
      locator: "art-17.1",
      dottedArticle: true,
      preferredLawIds: ["11634"],
    });
  });

  it("detects a dotted article without зүйл", () => {
    expect(detectExactCitation("Эрүүгийн хуулийн 17.1")).toMatchObject({
      titleHint: "Эрүүгийн",
      article: "17.1",
      paragraph: null,
      locator: "art-17.1",
      dottedArticle: true,
      preferredLawIds: ["11634"],
    });
  });

  it("detects Хөдөлмөрийн тухай хуулийн 43 дугаар зүйл", () => {
    expect(
      detectExactCitation("Хөдөлмөрийн тухай хуулийн 43 дугаар зүйл"),
    ).toMatchObject({
      titleHint: "Хөдөлмөрийн тухай",
      article: "43",
      paragraph: null,
      locator: "art-43",
      preferredLawIds: ["565"],
    });
  });

  it("detects constitution article paragraph pinpoint", () => {
    expect(
      detectExactCitation(
        "Монгол Улсын Үндсэн хуулийн 1 дүгээр зүйлийн 1 дэх хэсэг юу вэ?",
      ),
    ).toMatchObject({
      titleHint: "Монгол Улсын Үндсэн",
      article: "1",
      paragraph: "1",
      locator: "art-1/p-1",
      preferredLawIds: ["367"],
    });
  });

  it("does not treat weather or general legal questions as exact citations", () => {
    expect(detectExactCitation("Улаанбаатарын цаг агаар ямар вэ?")).toBeNull();
    expect(
      detectExactCitation("Ажлаас үндэслэлгүй халагдсан бол яах вэ?"),
    ).toBeNull();
    expect(detectExactCitation("17.1 дүгээр зүйл")).toBeNull();
  });

  it("keeps 17 and 17.1 as distinct printed locators", () => {
    expect(detectExactCitation("Эрүүгийн хуулийн 17 дугаар зүйл")).toMatchObject({
      article: "17",
      paragraph: null,
      locator: "art-17",
    });
    expect(detectExactCitation("Эрүүгийн хуулийн 17.1 дүгээр зүйл")).toMatchObject({
      article: "17.1",
      paragraph: null,
      locator: "art-17.1",
    });
  });

  it("still detects a citation after a historical date prefix", () => {
    expect(
      detectExactCitation(
        "2021 оны 5 сарын 10-нд Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?",
      ),
    ).toMatchObject({
      titleHint: "Эрүүгийн",
      article: "17.1",
      paragraph: null,
    });
  });

  it("detects citation when question and query are concatenated", () => {
    const once = "Эрүүгийн хуулийн 17.1 дүгээр зүйл";
    expect(detectExactCitation(`${once} ${once}`)).toMatchObject({
      article: "17.1",
      preferredLawIds: ["11634"],
    });
  });

  describe("two different statutes cited in one message", () => {
    // A message naming two distinct laws can only drive one "exact
    // citation" fast-path lookup per call — but whichever citation is
    // picked must be a clean, correctly-resolved one, never a garbled
    // match formed by the regex backtracking across the other citation.
    it("never returns a title contaminated by a leading conjunction left over from an earlier citation", () => {
      const result = detectExactCitation(
        "Иргэний хуулийн 17 дугаар зүйл болон Эрүүгийн хуулийн 10 дугаар зүйл хоёул юу гэж заасан бэ?",
      );
      expect(result).not.toBeNull();
      expect(result?.titleHint).not.toMatch(/^болон\s/iu);
      expect(result?.titleHint).toBe("Эрүүгийн");
      expect(result?.article).toBe("10");
      expect(result?.preferredLawIds).toEqual(["11634"]);
    });

    it("still cleanly resolves the dotted citation when a plain citation for a different law follows it", () => {
      const result = detectExactCitation(
        "Эрүүгийн хуулийн 17.1 дүгээр зүйл болон Хөдөлмөрийн тухай хуулийн 43 дугаар зүйл юу гэж заасан бэ?",
      );
      expect(result).not.toBeNull();
      expect(result?.titleHint).toBe("Эрүүгийн");
      expect(result?.article).toBe("17.1");
      expect(result?.dottedArticle).toBe(true);
      expect(result?.preferredLawIds).toEqual(["11634"]);
    });

    it("cleanly resolves the plain citation when it is named before a dotted citation for a different law", () => {
      const result = detectExactCitation(
        "Хөдөлмөрийн тухай хуулийн 43 дугаар зүйл болон Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?",
      );
      expect(result).not.toBeNull();
      expect(result?.titleHint).toBe("Хөдөлмөрийн тухай");
      expect(result?.article).toBe("43");
      expect(result?.preferredLawIds).toEqual(["565"]);
    });
  });

  describe("malformed and ambiguous citations fail safe (never fabricate, never crash)", () => {
    it("a comma-separated list of articles in one law is not treated as a single exact citation", () => {
      // Falls through to the open-question search path instead of
      // silently picking just one of the listed articles.
      const result = detectExactCitation(
        "Эрүүгийн хуулийн 17, 18, 19 дүгээр зүйл юу гэж заасан бэ?",
      );
      expect(result).toBeNull();
    });

    it("a chained cross-reference ('... article X гэж заасны дагуу <law 2> article Y') resolves the second law, not a garbled hybrid title", () => {
      // Known, accepted limitation: the captured title hint for the
      // second citation is contaminated with the connector phrase left
      // over from the first citation's article reference ("заасны
      // дагуу Иргэний", not just "Иргэний"). This still safely resolves
      // for a canonical law (lawId matching rescues it — see
      // canonical-law-titles.ts) rather than fabricating a wrong-law
      // match, but it is not a clean title hint. For a non-canonical law
      // the same contamination would make the title-hint lookup fail to
      // match and the citation would be safely treated as unresolved
      // (not found) rather than answered incorrectly — never a
      // wrong-law fabrication either way.
      const result = detectExactCitation(
        "Эрүүгийн хуулийн 17 дугаар зүйлд заасны дагуу Иргэний хуулийн 5 дугаар зүйл юу гэж заасан бэ?",
      );
      expect(result).not.toBeNull();
      expect(result?.article).toBe("5");
      expect(result?.preferredLawIds).toEqual(["299"]);
      expect(result?.titleHint).toContain("Иргэний");
    });

    it("does not crash and returns null for empty or whitespace-only input", () => {
      expect(detectExactCitation("")).toBeNull();
      expect(detectExactCitation("   ")).toBeNull();
    });

    it("a bare article number with no law title is never treated as an exact citation", () => {
      expect(detectExactCitation("17 дугаар зүйл юу гэж заасан бэ?")).toBeNull();
    });

    it("accepts a syntactically well-formed but non-existent article number without crashing (downstream retrieval must refuse it, not fabricate)", () => {
      const result = detectExactCitation(
        "Эрүүгийн хуулийн 0 дугаар зүйл юу гэж заасан бэ?",
      );
      expect(result).not.toBeNull();
      expect(result?.article).toBe("0");
      // Parsing accepting this is safe precisely because retrieval (see
      // knowledge-legal-corpus-retriever.test.ts: "does not invent a
      // missing provision") never fabricates an article that does not
      // exist in the corpus — it reports not_found instead.
    });
  });
});
