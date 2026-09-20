/**
 * P0 regression (post-audit fix): caching a verified, non-repealed article
 * must never let a REPEALED sibling article on the same page enter the
 * local corpus as an ordinary, unflagged article — because the
 * LOCAL_CORPUS tier (which runs BEFORE OFFICIAL_WEB in
 * TieredLegalCorpusRetriever) has no repeal check of its own.
 *
 * Uses the real captured Article 40 fixture (legalinfo-13025-repealed-
 * article-40.html) end to end: OFFICIAL_WEB verifies + caches Article 39,
 * then LOCAL_CORPUS is queried directly against the resulting cache for
 * Articles 39, 40, and 41.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfficialWebLegalCorpusRetriever } from "@/infrastructure/legal-web-research/official-web-legal-corpus-retriever";
import { KnowledgeLegalCorpusRetriever } from "@/infrastructure/ai/knowledge-legal-corpus-retriever";
import {
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  createArchiveService,
} from "@/engine/data/archive";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge";

const FIXTURE_13025 = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-13025-repealed-article-40.html"),
  "utf8",
);
const SOURCE_URL = "https://legalinfo.mn/mn/detail?lawId=13025";

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
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

function router(handlers: { detail?: Record<string, () => Response>; ajaxList?: () => Response }): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://legalinfo.mn/mn/ajaxList/") {
      if (!handlers.ajaxList) throw new Error("unexpected ajaxList call");
      return handlers.ajaxList();
    }
    for (const [detailUrl, handler] of Object.entries(handlers.detail ?? {})) {
      if (url === detailUrl) return handler();
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

let tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function buildCache() {
  const dir = await mkdtemp(join(tmpdir(), "cache-repealed-integrity-test-"));
  tempDirs.push(dir);
  const archive = createArchiveService({
    storage: new LocalFilesystemArchiveStorage(dir),
    repository: new InMemoryArchiveRepository(),
  });
  const repository = new InMemoryKnowledgeRepository();
  return { archive, repository };
}

describe("Article 39 -> cache -> Article 40 (P0 cache-poisoning regression)", () => {
  it("A-G: caching a verified Article 39 never lets repealed Article 40 become a valid local authority, and 39/41 remain retrievable", async () => {
    const cache = await buildCache();
    const fetchImpl = router({
      ajaxList: () => ajaxListResponse(listItem("13025", "ТӨРИЙН АЛБАНЫ ТУХАЙ /Шинэчилсэн найруулга/")),
      detail: { [SOURCE_URL]: () => htmlResponse(FIXTURE_13025) },
    });
    const officialWeb = new OfficialWebLegalCorpusRetriever({
      fetchImpl,
      rateLimitKey: "test:cache-repealed-integrity",
      cache: async () => cache,
    });

    // A. Retrieve Article 39 through OFFICIAL_WEB.
    const article39Query = "Төрийн албаны тухай хуулийн 39 дүгээр зүйл";
    const webResult = await officialWeb.retrieveExactCitation({
      question: article39Query,
      query: article39Query,
      locator: "art-39",
    });
    expect(webResult.kind).toBe("retrieved");
    if (webResult.kind === "retrieved") {
      expect(webResult.authorities[0]!.article).toBe("39");
      expect(webResult.authorities[0]!.sourceUrl).toBe(SOURCE_URL);
    }

    // B. Complete/flush the cache write deterministically (fire-and-forget by design).
    await vi.waitFor(async () => {
      const stored = await cache.repository.findBySourceUrl(SOURCE_URL);
      expect(stored).not.toBeNull();
    });

    const local = new KnowledgeLegalCorpusRetriever(cache.repository);

    // C + D. Query Article 40 through LOCAL_CORPUS — must NOT be VALID/current.
    const article40Query = "Төрийн албаны тухай хуулийн 40 дүгээр зүйл";
    const localArticle40 = await local.retrieveExactCitation({
      question: article40Query,
      query: article40Query,
      locator: "art-40",
    });
    expect(localArticle40.kind).not.toBe("retrieved");

    const localArticle40Verify = await local.verifyCitation({ query: article40Query, question: article40Query });
    expect(localArticle40Verify.ok && localArticle40Verify.verdict.status === "VALID").toBe(false);

    // E. Confirm Article 39 is still retrievable (through the now-cached local corpus).
    const localArticle39 = await local.retrieveExactCitation({
      question: article39Query,
      query: article39Query,
      locator: "art-39",
    });
    expect(localArticle39.kind).toBe("retrieved");
    if (localArticle39.kind === "retrieved") {
      expect(localArticle39.authorities[0]!.article).toBe("39");
    }

    // F. Confirm Article 41 is still retrievable.
    const article41Query = "Төрийн албаны тухай хуулийн 41 дүгээр зүйл";
    const localArticle41 = await local.retrieveExactCitation({
      question: article41Query,
      query: article41Query,
      locator: "art-41",
    });
    expect(localArticle41.kind).toBe("retrieved");
    if (localArticle41.kind === "retrieved") {
      expect(localArticle41.authorities[0]!.article).toBe("41");
    }

    // G. Confirm Article 40 is not persisted in the cached knowledge at all.
    const stored = await cache.repository.findBySourceUrl(SOURCE_URL);
    expect(stored).not.toBeNull();
    expect(stored!.articles.some((a) => a.articleNumber === "40")).toBe(false);
    expect(stored!.articles.some((a) => a.articleNumber === "39")).toBe(true);
    expect(stored!.articles.some((a) => a.articleNumber === "41")).toBe(true);

    const searchHits = await cache.repository.searchArticles({
      text: "40",
      articleNumber: "40",
      jurisdiction: "MN",
      officialSourceKinds: "all",
    });
    expect(searchHits.some((hit) => hit.articleNumber === "40")).toBe(false);
  });
});
