import { describe, expect, it, vi } from "vitest";

import {
  createArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  sha256Hex,
} from "@/engine/data/archive";
import {
  createKnowledgeEngine,
  HttpKnowledgeCrawler,
  InMemoryKnowledgeCrawler,
  KnowledgeDocumentKind,
  LEGALINFO_CONSTITUTION_LAW_ID,
  LEGALINFO_VERIFY_LAW_IDS,
  LegalInfoKnowledgeParser,
  legalInfoDetailUrl,
} from "@/engine/knowledge";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Realistic LegalInfo nesting: nested toolbar divs inside `law_content`
 * would truncate a non-greedy </div> extractor.
 */
function legalInfoFixture(options: {
  lawId: string;
  title: string;
  articles: Array<{ heading: string; body: string[] }>;
}): string {
  const url = legalInfoDetailUrl(options.lawId);
  const articleHtml = options.articles
    .map(
      (article) => `
        <div class="w-100 pull-left" style="color: #0057be;">
          <p>${article.heading}</p>
        </div>
        <span class="pull-right print-zuil">Хэвлэх</span>
        ${article.body
          .map(
            (line) => `
        <div class="w-100 pull-left" style="text-align: JUSTIFY;">
          <p style="padding-left: 1rem;">${line}</p>
        </div>`,
          )
          .join("")}
      `,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="utf-8" />
  <link rel="canonical" href="${url}" />
  <meta property="og:title" content="${options.title}" />
  <script>var lawId = '${options.lawId}';</script>
  <title>${options.title}</title>
</head>
<body>
  <h1>${options.title}</h1>
  <div class="main-huuliin-content">
    <div class="law_content pull-left">
      <div class="nom-more-header">
        <div class="uk-flex">
          <div class="w-100 media-link">
            <ul><li>Pdf</li><li>Word</li><li>Хэвлэх</li></ul>
          </div>
        </div>
      </div>
      <div class="maincontenter w-100 pull-left">
        <p>${options.title}</p>
        <p>НЭГДҮГЭЭР БҮЛЭГ НИЙТЛЭГ ҮНДЭСЛЭЛ</p>
        ${articleHtml}
      </div>
    </div>
  </div>
</body>
</html>`;
}

const FIXTURES: Record<string, string> = {
  [LEGALINFO_CONSTITUTION_LAW_ID]: legalInfoFixture({
    lawId: LEGALINFO_CONSTITUTION_LAW_ID,
    title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ",
    articles: [
      {
        heading: "Нэгдүгээр зүйл.",
        body: [
          "1.Монгол Улс бол тусгаар тогтносон, бүрэн эрхт, Бүгд найрамдах улс мөн.",
          "2.Ардчилсан ёс, шударга ёс, эрх чөлөө, тэгш байдал, үндэсний эв нэгдлийг хангах нь төрийн үйл ажиллагааны үндсэн зарчим мөн.",
        ],
      },
      {
        heading: "Хоёрдугаар зүйл.",
        body: ["1.Монгол Улс төрийн байгууламжийн хувьд нэгдмэл байна."],
      },
    ],
  }),
  "439": legalInfoFixture({
    lawId: "439",
    title: "ОРОН СУУЦНЫ ТУХАЙ",
    articles: [
      {
        heading: "1 дүгээр зүйл.Хуулийн зорилт",
        body: [
          "1.1.Энэ хуулийн зорилт нь орон сууцны харилцааг зохицуулахад оршино.",
        ],
      },
      {
        heading: "2 дугаар зүйл.Орон сууцны эрх зүйн зохицуулалт",
        body: ["2.1.Орон сууцны харилцааг хуулиар зохицуулна."],
      },
    ],
  }),
  "112": legalInfoFixture({
    lawId: "112",
    title: "БАРИЛГЫН ТУХАЙ",
    articles: [
      {
        heading: "1 дүгээр зүйл.Хуулийн зорилт",
        body: [
          "1.1.Энэ хуулийн зорилт нь барилгын үйл ажиллагааны эрх зүйн үндсийг тогтооход оршино.",
        ],
      },
      {
        heading: "2 дугаар зүйл.Барилгын норм",
        body: ["2.1.Барилгын норм, дүрмийг холбогдох байгууллага батална."],
      },
    ],
  }),
  "123": legalInfoFixture({
    lawId: "123",
    title: "ӨМЧ ХУВЬЧЛАХ ТУХАЙ ХУУЛЬ",
    articles: [
      {
        heading: "1 дүгээр зүйл.Хуулийн зорилт",
        body: [
          "1.1.Энэ хуулийн зорилт нь төрийн өмчийг хувьчлах журмыг тогтооход оршино.",
        ],
      },
      {
        heading: "2 дугаар зүйл.Хувьчлалын зарчим",
        body: ["2.1.Хувьчлалыг ил тод, нээлттэй явуулна."],
      },
    ],
  }),
  "400": legalInfoFixture({
    lawId: "400",
    title: "НОТАРИАТЫН ТУХАЙ",
    articles: [
      {
        heading: "1 дүгээр зүйл.Хуулийн зорилт",
        body: [
          "1.1.Энэ хуулийн зорилт нь нотариатын үйл ажиллагааны эрх зүйн үндсийг тогтооход оршино.",
        ],
      },
      {
        heading: "2 дугаар зүйл.Нотариатын чиг үүрэг",
        body: ["2.1.Нотариат гэрээ, баримт бичгийг гэрчилнэ."],
      },
    ],
  }),
};

describe("verify LegalInfo 5-law pipeline (offline fixtures)", () => {
  it("defines exactly 5 laws including constitution control", () => {
    expect(LEGALINFO_VERIFY_LAW_IDS).toHaveLength(5);
    expect(LEGALINFO_VERIFY_LAW_IDS).toContain(LEGALINFO_CONSTITUTION_LAW_ID);
    for (const lawId of LEGALINFO_VERIFY_LAW_IDS) {
      expect(FIXTURES[lawId]).toBeTruthy();
    }
  });

  it("crawls all 5 via HttpKnowledgeCrawler and ingests with articles/chunks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tore-verify-5-"));
    const archiveRepository = new InMemoryArchiveRepository();
    const archive = createArchiveService({
      repository: archiveRepository,
      storage: new LocalFilesystemArchiveStorage(dir),
    });

    const fetchImpl = vi.fn(async (url: string) => {
      const lawId = new URL(url).searchParams.get("lawId");
      expect(lawId).toBeTruthy();
      const html = FIXTURES[lawId!];
      expect(html).toBeTruthy();
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    try {
      // Default wiring stays offline / empty.
      expect(
        (await createKnowledgeEngine().ingest({ sourceId: "legalinfo" }))
          .ingested,
      ).toEqual([]);

      const urls = LEGALINFO_VERIFY_LAW_IDS.map((id) => legalInfoDetailUrl(id));
      const httpCrawler = new HttpKnowledgeCrawler({
        fetchImpl,
        lawIds: [...LEGALINFO_VERIFY_LAW_IDS],
        archive,
        maxRetries: 0,
      });

      const rawDocuments = await httpCrawler.crawl({
        sourceId: "legalinfo",
        urls: [...urls],
        maxDocuments: 5,
      });
      expect(rawDocuments).toHaveLength(5);
      expect(fetchImpl).toHaveBeenCalledTimes(5);

      for (const raw of rawDocuments) {
        const hash = sha256Hex(raw.bytes);
        expect((await archive.findByHash(hash))?.originalUrl).toBe(raw.sourceUrl);
        expect(raw.bytes.byteLength).toBeGreaterThan(100);
      }

      const engine = createKnowledgeEngine({
        crawler: new InMemoryKnowledgeCrawler(rawDocuments),
        parser: new LegalInfoKnowledgeParser(),
      });

      const result = await engine.ingest({
        sourceId: "legalinfo",
        urls: [...urls],
        maxDocuments: 5,
      });

      expect(result.failed).toEqual([]);
      expect(result.ingested).toHaveLength(5);

      for (const stored of result.ingested) {
        const lawId = new URL(stored.sourceUrl).searchParams.get("lawId");
        expect(lawId).toBeTruthy();
        expect(stored.title.trim().length).toBeGreaterThan(0);
        expect(stored.articles.length).toBeGreaterThan(0);
        expect(stored.chunks.length).toBeGreaterThan(0);

        if (lawId === LEGALINFO_CONSTITUTION_LAW_ID) {
          expect(
            stored.articles.some((a) => /тусгаар\s+тогтносон/i.test(a.text)),
          ).toBe(true);
        }
        if (lawId === "439") {
          expect(
            stored.articles.some((a) => /орон\s+сууцны\s+харилцаа/i.test(a.text)),
          ).toBe(true);
        }
        if (lawId === "400") {
          expect(
            stored.articles.some((a) => /нотариат/i.test(a.text)),
          ).toBe(true);
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records zero-article parses as unsuccessful for verification criteria", async () => {
    const emptyLaw = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="ХООСОН ТУХАЙ" />
  <script>var lawId = '999001';</script>
</head>
<body>
  <h1>ХООСОН ТУХАЙ</h1>
  <div class="law_content pull-left">
    <div class="toolbar"><div>Pdf</div></div>
    <div class="maincontenter">
      <p>ХООСОН ТУХАЙ</p>
      <p>Зөвхөн оршил текст, зүйлгүй.</p>
    </div>
  </div>
</body>
</html>`;

    const parser = new LegalInfoKnowledgeParser();
    const parsed = await parser.parse({
      sourceId: "legalinfo",
      sourceUrl: legalInfoDetailUrl("999001"),
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(emptyLaw),
      contentType: "text/html",
      fetchedAt: new Date(),
    });

    expect(parsed.title.trim().length).toBeGreaterThan(0);
    expect(parsed.articles.length).toBe(0);
    // Verification script must treat this as FAILURE (not silent success).
    const wouldPassVerification =
      parsed.articles.length > 0 && parsed.title.trim().length > 0;
    expect(wouldPassVerification).toBe(false);
  });
});
