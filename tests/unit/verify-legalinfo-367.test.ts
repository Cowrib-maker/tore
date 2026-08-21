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
  LEGALINFO_CONSTITUTION_LAW_ID,
  LegalInfoKnowledgeParser,
  legalInfoDetailUrl,
} from "@/engine/knowledge";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CONSTITUTION_URL = legalInfoDetailUrl(LEGALINFO_CONSTITUTION_LAW_ID);

/** Minimal LegalInfo-shaped HTML sufficient for adapter + law parser. */
const CONSTITUTION_FIXTURE = `<!DOCTYPE html>
<html>
<head>
  <link rel="canonical" href="${CONSTITUTION_URL}" />
  <script>var lawId = "367";</script>
</head>
<body>
  <h1>МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ</h1>
  <div data-block="enacteddate">1992 оны 1 дүгээр сарын 13</div>
  <div data-block="enforcementdate">1992 оны 2 дугаар сарын 12</div>
  <div class="law-content">
    <p>МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ</p>
    <p>НЭГДҮГЭЭР БҮЛЭГ МОНГОЛ УЛСЫН БҮРЭН ЭРХТ БАЙДАЛ</p>
    <p>1 дүгээр зүйл.Монгол Улс</p>
    <p>1.1.Монгол Улс бол тусгаар тогтносон бүрэн эрхт улс мөн.</p>
    <p>1.2.Монгол Улсын тусгаар тогтносон бүрэн эрхт байдлын баталгаа нь ардчилсан ёс, шударга ёс, эрх чөлөө, тэгш байдал, үндэсний эв нэгдэл юм.</p>
    <p>2 дугаар зүйл.Төрийн бүтэц</p>
    <p>2.1.Монгол Улс нь парламентын засаглалтай улс мөн.</p>
  </div>
</body>
</html>`;

describe("verify LegalInfo lawId=367 pipeline (offline fixture)", () => {
  it("runs HttpKnowledgeCrawler → LegalInfo parser → ingest with archive", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tore-verify-367-"));
    const archiveRepository = new InMemoryArchiveRepository();
    const archive = createArchiveService({
      repository: archiveRepository,
      storage: new LocalFilesystemArchiveStorage(dir),
    });

    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(CONSTITUTION_URL);
      return new Response(CONSTITUTION_FIXTURE, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    try {
      const httpCrawler = new HttpKnowledgeCrawler({
        fetchImpl,
        lawIds: [LEGALINFO_CONSTITUTION_LAW_ID],
        archive,
        maxRetries: 0,
      });

      const rawDocuments = await httpCrawler.crawl({
        sourceId: "legalinfo",
        urls: [CONSTITUTION_URL],
        maxDocuments: 1,
      });
      expect(rawDocuments).toHaveLength(1);

      const raw = rawDocuments[0]!;
      expect(raw.sourceUrl).toBe(CONSTITUTION_URL);
      expect(raw.bytes.byteLength).toBeGreaterThan(100);
      expect(raw.contentType).toContain("text/html");

      const hash = sha256Hex(raw.bytes);
      expect((await archive.findByHash(hash))?.originalUrl).toBe(CONSTITUTION_URL);

      const engine = createKnowledgeEngine({
        crawler: new InMemoryKnowledgeCrawler([raw]),
        parser: new LegalInfoKnowledgeParser(),
      });
      // Default createKnowledgeEngine() crawler remains InMemory when called bare.
      expect(
        (await createKnowledgeEngine().ingest({ sourceId: "legalinfo" }))
          .ingested,
      ).toEqual([]);

      const result = await engine.ingest({
        sourceId: "legalinfo",
        maxDocuments: 1,
      });

      expect(result.failed).toEqual([]);
      expect(result.ingested).toHaveLength(1);
      const stored = result.ingested[0]!;
      expect(stored.title.toLowerCase()).toContain("үндсэн");
      expect(stored.articles.length).toBeGreaterThanOrEqual(2);
      expect(stored.chunks.length).toBeGreaterThan(0);
      expect(stored.articles.some((a) => a.articleNumber === "1")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
