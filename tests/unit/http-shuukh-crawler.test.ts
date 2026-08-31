import { describe, expect, it } from "vitest";

import {
  HttpShuukhCrawler,
  KnowledgeDocumentKind,
  assertHttpsShuukhUrl,
  caseIdFromShuukhUrl,
} from "@/engine/knowledge";
import { KnowledgeCrawlError } from "@/engine/knowledge/crawler/legalinfo-url";

describe("HttpShuukhCrawler", () => {
  it("rejects non-shuukh hosts", () => {
    expect(() => assertHttpsShuukhUrl("https://legaldata.mn/x")).toThrow(
      KnowledgeCrawlError,
    );
  });

  it("fetches judgment HTML via injectable fetch and keeps case id", async () => {
    const html = "<html><body><p>Шийдвэр</p></body></html>";
    const crawler = new HttpShuukhCrawler({
      fetchImpl: async (input) => {
        expect(String(input)).toContain("shuukh.mn/single_case/260600");
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
      maxRetries: 0,
    });

    const docs = await crawler.crawl({
      sourceId: "shuukh",
      urls: ["https://shuukh.mn/single_case/260600"],
      maxDocuments: 1,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]?.kind).toBe(KnowledgeDocumentKind.HTML);
    expect(caseIdFromShuukhUrl(docs[0]!.sourceUrl)).toBe("260600");
    expect(new TextDecoder().decode(docs[0]!.bytes)).toContain("Шийдвэр");
  });

  it("requires urls on the crawl job", async () => {
    const crawler = new HttpShuukhCrawler({ maxRetries: 0 });
    await expect(
      crawler.crawl({ sourceId: "shuukh" }),
    ).rejects.toBeInstanceOf(KnowledgeCrawlError);
  });
});
