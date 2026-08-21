import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
} from "@/engine/data/archive";
import {
  HttpKnowledgeCrawler,
  KnowledgeDocumentKind,
  LEGALINFO_CONSTITUTION_LAW_ID,
  createKnowledgeEngine,
  legalInfoDetailUrl,
} from "@/engine/knowledge";

const CONSTITUTION_URL = legalInfoDetailUrl(LEGALINFO_CONSTITUTION_LAW_ID);

function htmlResponse(
  body: string,
  init: {
    status?: number;
    contentType?: string;
    headers?: Record<string, string>;
  } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "content-type": init.contentType ?? "text/html; charset=utf-8",
      ...init.headers,
    },
  });
}

describe("legalInfoDetailUrl", () => {
  it("builds the official lawId=367 Constitution detail URL", () => {
    expect(legalInfoDetailUrl("367")).toBe(
      "https://legalinfo.mn/mn/detail?lawId=367",
    );
    expect(CONSTITUTION_URL).toBe("https://legalinfo.mn/mn/detail?lawId=367");
  });
});

describe("HttpKnowledgeCrawler", () => {
  it("fetches a LegalInfo HTML page into RawKnowledgeDocument", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(CONSTITUTION_URL);
      return htmlResponse(
        "<html><head><title>Үндсэн хууль</title></head><body><h1>Монгол Улсын Үндсэн хууль</h1></body></html>",
      );
    });

    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      lawIds: [LEGALINFO_CONSTITUTION_LAW_ID],
      maxRetries: 0,
    });

    const documents = await crawler.crawl({ sourceId: "legalinfo" });
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      sourceId: "legalinfo",
      sourceUrl: CONSTITUTION_URL,
      kind: KnowledgeDocumentKind.HTML,
      contentType: "text/html; charset=utf-8",
    });
    expect(new TextDecoder().decode(documents[0]!.bytes)).toContain(
      "Үндсэн хууль",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("times out when the AbortController aborts the request", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      return await new Promise<Response>((_resolve, reject) => {
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        const fail = () => {
          reject(new DOMException("Aborted", "AbortError"));
        };
        if (signal.aborted) {
          fail();
          return;
        }
        signal.addEventListener("abort", fail);
      });
    });

    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      lawIds: ["367"],
      timeoutMs: 25,
      maxRetries: 0,
    });

    // Per-URL failure is swallowed so the ingestion job is not aborted.
    await expect(
      crawler.crawl({ sourceId: "legalinfo", urls: [CONSTITUTION_URL] }),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("treats non-2xx responses as failure", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("nope", { status: 404 }));
    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      maxRetries: 0,
    });

    const documents = await crawler.crawl({
      sourceId: "legalinfo",
      urls: [CONSTITUTION_URL],
    });
    expect(documents).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects invalid content types", async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse("%PDF-1.4", {
        status: 200,
        contentType: "application/pdf",
      }),
    );
    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      maxRetries: 0,
    });

    await expect(
      crawler.crawl({
        sourceId: "legalinfo",
        urls: [CONSTITUTION_URL],
      }),
    ).resolves.toEqual([]);
  });

  it("rejects responses that exceed the size limit", async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse("x".repeat(64), {
        headers: { "content-length": "100" },
      }),
    );
    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      maxBytes: 50,
      maxRetries: 0,
    });

    await expect(
      crawler.crawl({
        sourceId: "legalinfo",
        urls: [CONSTITUTION_URL],
      }),
    ).resolves.toEqual([]);
  });

  it("retries transient failures then succeeds", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return htmlResponse("busy", { status: 503 });
      }
      return htmlResponse("<html><body>ok</body></html>");
    });

    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      maxRetries: 3,
    });

    const documents = await crawler.crawl({
      sourceId: "legalinfo",
      urls: [CONSTITUTION_URL],
    });

    expect(documents).toHaveLength(1);
    expect(attempts).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("uses lawId=367 as the default production seed URL", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://legalinfo.mn/mn/detail?lawId=367");
      return htmlResponse("<html><body>constitution</body></html>");
    });

    const crawler = new HttpKnowledgeCrawler({ fetchImpl, maxRetries: 0 });
    await crawler.crawl({ sourceId: "legalinfo" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://legalinfo.mn/mn/detail?lawId=367",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
      }),
    );
  });

  it("archives raw bytes when ArchiveService is injected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tore-knowledge-archive-"));
    const repository = new InMemoryArchiveRepository();
    const archive = createArchiveService({
      repository,
      storage: new LocalFilesystemArchiveStorage(dir),
    });
    const fetchImpl = vi.fn(async () =>
      htmlResponse("<html><body>archived</body></html>"),
    );

    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      archive,
      maxRetries: 0,
    });
    const documents = await crawler.crawl({
      sourceId: "legalinfo",
      urls: [CONSTITUTION_URL],
    });

    expect(documents).toHaveLength(1);
    const sha256 = createHash("sha256")
      .update(documents[0]!.bytes)
      .digest("hex");
    expect((await archive.findByHash(sha256))?.originalUrl).toBe(CONSTITUTION_URL);
  });

  it("continues crawling after one URL fails (onDocumentError)", async () => {
    const errors: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("lawId=404")) {
        return htmlResponse("missing", { status: 404 });
      }
      return htmlResponse("<html><body>ok</body></html>");
    });

    const crawler = new HttpKnowledgeCrawler({
      fetchImpl,
      lawIds: ["404", "367"],
      maxRetries: 0,
      onDocumentError: ({ sourceUrl }) => {
        errors.push(sourceUrl);
      },
    });

    const documents = await crawler.crawl({
      sourceId: "legalinfo",
      urls: [
        legalInfoDetailUrl("404"),
        legalInfoDetailUrl("367"),
      ],
    });

    expect(errors).toEqual([legalInfoDetailUrl("404")]);
    expect(documents).toHaveLength(1);
    expect(documents[0]?.sourceUrl).toBe(legalInfoDetailUrl("367"));
  });

  it("keeps createKnowledgeEngine default crawler offline (InMemory)", async () => {
    const engine = createKnowledgeEngine();
    const result = await engine.ingest({ sourceId: "legalinfo" });
    expect(result.ingested).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("injects HttpKnowledgeCrawler into createKnowledgeEngine without changing ingest", async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse(`<h1>Монгол Улсын Үндсэн хууль</h1>
<p>Зүйл 1. Монгол Улс</p>
<p>${"төр ".repeat(120)}</p>`),
    );
    const engine = createKnowledgeEngine({
      crawler: new HttpKnowledgeCrawler({
        fetchImpl,
        lawIds: ["367"],
        maxRetries: 0,
      }),
    });

    const result = await engine.ingest({ sourceId: "legalinfo" });
    expect(result.failed).toEqual([]);
    expect(result.ingested).toHaveLength(1);
    expect(result.ingested[0]?.sourceUrl).toBe(CONSTITUTION_URL);
  });
});
