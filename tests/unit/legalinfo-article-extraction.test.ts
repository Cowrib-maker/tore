import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { extractVerifiedLegalInfoArticle } from "@/infrastructure/legal-web-research/legalinfo-article-extraction";

const FIXTURE_11259 = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-11259-administrative-general-law.html"),
  "utf8",
);
const FIXTURE_13025_REPEALED = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-13025-repealed-article-40.html"),
  "utf8",
);
const SOURCE_URL = "https://legalinfo.mn/mn/detail?lawId=11259";
const REPEALED_SOURCE_URL = "https://legalinfo.mn/mn/detail?lawId=13025";

describe("extractVerifiedLegalInfoArticle", () => {
  it("extracts the exact requested article's real text from a live-shaped LegalInfo page", async () => {
    const result = await extractVerifiedLegalInfoArticle({
      html: FIXTURE_11259,
      sourceUrl: SOURCE_URL,
      titleHint: "Захиргааны ерөнхий хуулийн",
      article: "56",
      paragraph: null,
    });
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.article.documentTitle).toContain("ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ");
    expect(result.article.articleNumber).toBe("56");
    expect(result.article.text).toContain("Захиргааны гэрээнд өөрчлөлт оруулах, цуцлах тусгай тохиолдол");
    expect(result.article.text).toContain("56.1.");
    expect(result.article.text).toContain("56.4.");
    // Never bleeds into the next article.
    expect(result.article.text).not.toContain("57.1.");
  });

  it("extracts a specific dotted paragraph when one is requested", async () => {
    const result = await extractVerifiedLegalInfoArticle({
      html: FIXTURE_11259,
      sourceUrl: SOURCE_URL,
      titleHint: "Захиргааны ерөнхий хуулийн",
      article: "56",
      paragraph: "2",
    });
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.article.text).toContain("Өөрчлөх боломжгvй".replace("v", "ү"));
  });

  it("returns not_found (never fabricates) when the requested article does not exist on the page", async () => {
    const result = await extractVerifiedLegalInfoArticle({
      html: FIXTURE_11259,
      sourceUrl: SOURCE_URL,
      titleHint: "Захиргааны ерөнхий хуулийн",
      article: "999",
      paragraph: null,
    });
    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns not_found when the document title does not match the citation's law name — refuses to bind the wrong law", async () => {
    const result = await extractVerifiedLegalInfoArticle({
      html: FIXTURE_11259,
      sourceUrl: SOURCE_URL,
      titleHint: "Эрvvгийн хуулийн".replace("v", "ү"),
      article: "56",
      paragraph: null,
    });
    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns not_found (never throws) on unparsable HTML", async () => {
    const result = await extractVerifiedLegalInfoArticle({
      html: "<html><body>not a law page</body></html>",
      sourceUrl: SOURCE_URL,
      titleHint: "Захиргааны ерөнхий хуулийн",
      article: "56",
      paragraph: null,
    });
    expect(result).toEqual({ kind: "not_found" });
  });

  describe("repealed-article detection (real captured Article 40 of law 13025)", () => {
    it("refuses a whole article that is struck through on the page, never returning it as current law", async () => {
      const result = await extractVerifiedLegalInfoArticle({
        html: FIXTURE_13025_REPEALED,
        sourceUrl: REPEALED_SOURCE_URL,
        titleHint: "Төрийн албаны тухай",
        article: "40",
        paragraph: null,
      });
      expect(result).toEqual({ kind: "repealed", articleNumber: "40" });
    });

    it("refuses a specific struck-through paragraph even if requested directly", async () => {
      const result = await extractVerifiedLegalInfoArticle({
        html: FIXTURE_13025_REPEALED,
        sourceUrl: REPEALED_SOURCE_URL,
        titleHint: "Төрийн албаны тухай",
        article: "40",
        paragraph: "1",
      });
      expect(result.kind).toBe("repealed");
    });

    it("still extracts a neighboring article on the same page that is NOT struck through", async () => {
      const result = await extractVerifiedLegalInfoArticle({
        html: FIXTURE_13025_REPEALED,
        sourceUrl: REPEALED_SOURCE_URL,
        titleHint: "Төрийн албаны тухай",
        article: "39",
        paragraph: null,
      });
      expect(result.kind).toBe("found");
      if (result.kind !== "found") return;
      expect(result.article.text).toContain("Ашиг сонирхлын зөрчлөөс урьдчилан сэргийлэх");
    });

    it("still extracts Article 41 (after the repealed article) unaffected", async () => {
      const result = await extractVerifiedLegalInfoArticle({
        html: FIXTURE_13025_REPEALED,
        sourceUrl: REPEALED_SOURCE_URL,
        titleHint: "Төрийн албаны тухай",
        article: "41",
        paragraph: null,
      });
      expect(result.kind).toBe("found");
    });
  });
});
