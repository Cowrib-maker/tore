import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  formatCitationArticleLine,
  LegalAiCitationList,
} from "@/components/legal-ai/legal-ai-citation-list";
import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";

function citation(
  overrides: Partial<LegalAiSafeCitation> = {},
): LegalAiSafeCitation {
  return {
    id: "cite-1",
    sourceType: "legal-knowledge",
    title: "Монгол Улсын Эрүүгийн хууль",
    article: "17.1",
    paragraph: "1",
    sourceUrl: null,
    sourceVersion: null,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

describe("LegalAiCitationList", () => {
  it("renders Эх сурвалж with available fields only", () => {
    const html = renderToStaticMarkup(
      createElement(LegalAiCitationList, {
        citations: [
          citation({
            sourceUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-criminal",
          }),
        ],
      }),
    );
    expect(html).toContain("Эх сурвалж");
    expect(html).toContain("Монгол Улсын Эрүүгийн хууль");
    expect(html).toContain("17.1 дүгээр зүйл");
    expect(html).toContain("https://legalinfo.mn/mn/detail?lawId=fixture-criminal");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).not.toContain("Хувилбар");
    expect(html).not.toContain("Хүчинтэй");
  });

  it("renders nothing when there are no citations", () => {
    expect(
      renderToStaticMarkup(
        createElement(LegalAiCitationList, { citations: [] }),
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(LegalAiCitationList, { citations: undefined }),
      ),
    ).toBe("");
  });

  it("does not invent a source URL or dates when metadata is missing", () => {
    const html = renderToStaticMarkup(
      createElement(LegalAiCitationList, { citations: [citation()] }),
    );
    expect(html).toContain("Эх сурвалж");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("2017");
    expect(html).not.toContain("http");
  });
});

describe("formatCitationArticleLine", () => {
  it("uses the stored article number and does not fabricate one", () => {
    expect(formatCitationArticleLine({ article: "17.1", paragraph: "1" })).toBe(
      "17.1 дүгээр зүйл",
    );
    expect(formatCitationArticleLine({ article: null, paragraph: null })).toBe(
      null,
    );
  });
});
