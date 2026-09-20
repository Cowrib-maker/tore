import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfficialWebLegalCorpusRetriever } from "@/infrastructure/legal-web-research/official-web-legal-corpus-retriever";
import {
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  createArchiveService,
} from "@/engine/data/archive";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge";

const FIXTURE_11259 = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-11259-administrative-general-law.html"),
  "utf8",
);
const FIXTURE_11634 = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-11634-dotted-articles.html"),
  "utf8",
);
const FIXTURE_13025_REPEALED = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-13025-repealed-article-40.html"),
  "utf8",
);

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function listItem(lawId: string, title: string): string {
  return `<a href="https://legalinfo.mn/mn/detail?lawId=${lawId}" class="act-name fw-500">${title}</a>`;
}

function ajaxListResponse(html: string): Response {
  return new Response(JSON.stringify({ Html: html }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Routes GET detail-page and POST ajaxList requests to the right fake response. */
function router(handlers: {
  detail?: Record<string, () => Response>;
  ajaxList?: () => Response;
}): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://legalinfo.mn/mn/ajaxList/") {
      if (!handlers.ajaxList) throw new Error("unexpected ajaxList call");
      return handlers.ajaxList();
    }
    for (const [detailUrl, handler] of Object.entries(handlers.detail ?? {})) {
      if (url === detailUrl) return handler();
    }
    throw new Error(`unexpected fetch: ${url} ${init?.method ?? "GET"}`);
  }) as unknown as typeof fetch;
}

let tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
  vi.restoreAllMocks();
});

async function buildCache() {
  const dir = await mkdtemp(join(tmpdir(), "official-web-retriever-test-"));
  tempDirs.push(dir);
  const archive = createArchiveService({
    storage: new LocalFilesystemArchiveStorage(dir),
    repository: new InMemoryArchiveRepository(),
  });
  const repository = new InMemoryKnowledgeRepository();
  return { archive, repository };
}

describe("OfficialWebLegalCorpusRetriever.retrieveExactCitation", () => {
  it("fetches a known canonical law's page directly (no discovery) and returns a verified authority", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveExactCitation({
      question: "Эрүүгийн хуулийн 1.1 дүгээр зүйл",
      query: "Эрүүгийн хуулийн 1.1 дүгээр зүйл",
      locator: "art-1.1",
    });

    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities).toHaveLength(1);
      expect(result.authorities[0]!.sourceUrl).toBe("https://legalinfo.mn/mn/detail?lawId=11634");
      expect(result.authorities[0]!.article).toBe("1.1");
      expect(result.authorities[0]!.title).toContain("ЭРҮҮГИЙН ХУУЛЬ");
    }
  });

  it("discovers an unknown law's page by title, then fetches and verifies its article", async () => {
    const fetchImpl = router({
      ajaxList: () => ajaxListResponse(listItem("11259", "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ")),
      detail: { "https://legalinfo.mn/mn/detail?lawId=11259": () => htmlResponse(FIXTURE_11259) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveExactCitation({
      question: "Захиргааны ерөнхий хуулийн 56 дугаар зүйл",
      query: "Захиргааны ерөнхий хуулийн 56 дугаар зүйл",
      locator: "art-56",
    });

    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities[0]!.excerpt).toContain("өөрчлөлт оруулах, цуцлах тусгай тохиолдол");
      expect(result.authorities[0]!.sourceUrl).toBe("https://legalinfo.mn/mn/detail?lawId=11259");
      expect(fetchImpl).toHaveBeenCalled();
    }
  });

  it("returns unavailable without any network call for a non-exact question", async () => {
    const fetchImpl = router({});
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveExactCitation({
      question: "Ямар эрх зvйн зохицуулалт байдаг вэ?",
      query: "Ямар эрх зvйн зохицуулалт байдаг вэ?",
      locator: null,
    });

    expect(result).toEqual({ kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns unavailable when discovery finds no matching law", async () => {
    const fetchImpl = router({
      ajaxList: () => ajaxListResponse(listItem("999", "ЗАМ ТЭЭВРИЙН ТУХАЙ")),
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl, maxDiscoveryPages: 1 });

    const result = await retriever.retrieveExactCitation({
      question: "Захиргааны ерөнхий хуулийн 56 дугаар зүйл",
      query: "Захиргааны ерөнхий хуулийн 56 дугаар зүйл",
      locator: "art-56",
    });

    expect(result.kind).toBe("unavailable");
  });

  it("returns unavailable when the article is not on the fetched page — never fabricates", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveExactCitation({
      question: "Эрvvгийн хуулийн 999 дvгээр зvйл".replace(/v/g, "ү"),
      query: "Эрvvгийн хуулийн 999 дvгээр зvйл".replace(/v/g, "ү"),
      locator: "art-999",
    });

    expect(result.kind).toBe("unavailable");
  });

  it("returns unavailable (never throws) when the fetch itself fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl, timeoutMs: 500 });

    const result = await retriever.retrieveExactCitation({
      question: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      query: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      locator: "art-1.1",
    });

    expect(result.kind).toBe("unavailable");
  });

  it("only ever fetches from legalinfo.mn — never any other host", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });
    await retriever.retrieveExactCitation({
      question: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      query: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      locator: "art-1.1",
    });
    const calledUrls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (call) => String(call[0]),
    );
    expect(calledUrls.every((url) => url.startsWith("https://legalinfo.mn/"))).toBe(true);
  });

  it("respects the rate limit — refuses without a network call once the budget is spent", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({
      fetchImpl,
      rateLimitPerMinute: 1,
      rateLimitKey: "test:rate-limit-isolation",
    });
    const query = "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү");

    const first = await retriever.retrieveExactCitation({ question: query, query, locator: "art-1.1" });
    expect(first.kind).toBe("retrieved");

    const callsAfterFirst = (fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    const second = await retriever.retrieveExactCitation({ question: query, query, locator: "art-1.1" });
    expect(second.kind).toBe("unavailable");
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(callsAfterFirst);
  });

  it("resolves the real ambiguous-title case (req #1 regression) end to end without binding the wrong law", async () => {
    const fetchImpl = router({
      ajaxList: () =>
        ajaxListResponse(
          [
            listItem("488", "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛИЙГ ДАГАЖ МӨРДӨХ ЖУРМЫН ТУХАЙ"),
            listItem("13050", "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ"),
            listItem("13025", "ТӨРИЙН АЛБАНЫ ТУХАЙ /Шинэчилсэн найруулга/"),
          ].join(""),
        ),
      detail: {
        "https://legalinfo.mn/mn/detail?lawId=13025": () => htmlResponse(FIXTURE_13025_REPEALED),
      },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveExactCitation({
      question: "Төрийн албаны тухай хуулийн 39 дүгээр зүйл",
      query: "Төрийн албаны тухай хуулийн 39 дүгээр зүйл",
      locator: "art-39",
    });

    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities[0]!.sourceUrl).toBe("https://legalinfo.mn/mn/detail?lawId=13025");
      expect(result.authorities[0]!.article).toBe("39");
    }
  });

  it("refuses (ambiguous) rather than guess when two candidates are both exact title matches", async () => {
    const fetchImpl = router({
      ajaxList: () =>
        ajaxListResponse(
          listItem("11259", "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ") +
            listItem("99999", "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ /Хуучин хувилбар/"),
        ),
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveExactCitation({
      question: "Захиргааны ерөнхий хуулийн 56 дугаар зүйл",
      query: "Захиргааны ерөнхий хуулийн 56 дугаар зүйл",
      locator: "art-56",
    });

    expect(result.kind).toBe("unavailable");
  });

  it("returns as_of_unavailable (never presents it as current) for a repealed article — real captured Article 40 of law 13025", async () => {
    const fetchImpl = router({
      ajaxList: () => ajaxListResponse(listItem("13025", "ТӨРИЙН АЛБАНЫ ТУХАЙ /Шинэчилсэн найруулга/")),
      detail: {
        "https://legalinfo.mn/mn/detail?lawId=13025": () => htmlResponse(FIXTURE_13025_REPEALED),
      },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveExactCitation({
      question: "Төрийн албаны тухай хуулийн 40 дүгээр зүйл",
      query: "Төрийн албаны тухай хуулийн 40 дүгээр зүйл",
      locator: "art-40",
    });

    expect(result.kind).toBe("as_of_unavailable");
  });

  it("returns as_of_unavailable when the question explicitly asks whether the provision is CURRENTLY in force and the source cannot prove that", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });
    const query = "Эрvvгийн хуулийн 1.1 дvгээр зvйл одоо хvчинтэй vv?".replace(/v/g, "ү");

    const result = await retriever.retrieveExactCitation({
      question: query,
      query,
      locator: "art-1.1",
    });

    expect(result.kind).toBe("as_of_unavailable");
  });

  it("bounds total latency with one overall deadline even when every individual call would otherwise hang", async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const retriever = new OfficialWebLegalCorpusRetriever({
      fetchImpl,
      timeoutMs: 60_000,
      overallDeadlineMs: 50,
      rateLimitKey: "test:overall-deadline",
    });
    const query = "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү");

    const started = Date.now();
    const result = await retriever.retrieveExactCitation({ question: query, query, locator: "art-1.1" });
    const elapsedMs = Date.now() - started;

    expect(result).toEqual({ kind: "unavailable", reason: "timeout", authorities: [], retrievedAt: null });
    // Comfortably below the per-call 60s timeout, proving the overall
    // deadline — not the per-call timeout — is what ended this attempt.
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe("OfficialWebLegalCorpusRetriever.retrieveLegalQuestion", () => {
  it("never performs a web search — always unavailable, no network calls", async () => {
    const fetchImpl = router({});
    const retriever = new OfficialWebLegalCorpusRetriever({ fetchImpl });

    const result = await retriever.retrieveLegalQuestion({
      question: "Ямар эрх зvйн зохицуулалт байдаг вэ?",
      query: "Ямар эрх зvйн зохицуулалт байдаг вэ?",
      locator: null,
    });

    expect(result).toEqual({ kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("OfficialWebLegalCorpusRetriever caching", () => {
  it("best-effort caches a verified document so it becomes locally searchable, without affecting the returned result", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const cache = await buildCache();
    const retriever = new OfficialWebLegalCorpusRetriever({
      fetchImpl,
      cache: async () => cache,
    });

    const result = await retriever.retrieveExactCitation({
      question: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      query: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      locator: "art-1.1",
    });
    expect(result.kind).toBe("retrieved");

    await vi.waitFor(async () => {
      const stored = await cache.repository.findBySourceUrl("https://legalinfo.mn/mn/detail?lawId=11634");
      expect(stored).not.toBeNull();
    });
  });

  it("still returns the verified answer even when the cache factory itself rejects", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({
      fetchImpl,
      cache: async () => {
        throw new Error("archive stack unavailable");
      },
    });

    const result = await retriever.retrieveExactCitation({
      question: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      query: "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү"),
      locator: "art-1.1",
    });
    expect(result.kind).toBe("retrieved");
  });

  it("still returns the verified answer quickly even when the cache factory hangs forever — caching must never race the citation answer against the overall deadline", async () => {
    const fetchImpl = router({
      detail: { "https://legalinfo.mn/mn/detail?lawId=11634": () => htmlResponse(FIXTURE_11634) },
    });
    const retriever = new OfficialWebLegalCorpusRetriever({
      fetchImpl,
      overallDeadlineMs: 200,
      rateLimitKey: "test:cache-never-blocks-answer",
      cache: () => new Promise(() => {}), // never resolves
    });
    const query = "Эрvvгийн хуулийн 1.1 дvгээр зvйл".replace(/v/g, "ү");

    const started = Date.now();
    const result = await retriever.retrieveExactCitation({ question: query, query, locator: "art-1.1" });
    const elapsedMs = Date.now() - started;

    expect(result.kind).toBe("retrieved");
    expect(elapsedMs).toBeLessThan(200);
  });
});
