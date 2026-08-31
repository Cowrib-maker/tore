/**
 * LOCAL / STAGING shuukh.mn judgment canary → Prisma + local archive.
 *
 * Default max 40 judgments (plan 2C: 20–50). Does not scrape legaldata.mn.
 * Detail HTML is fetched via Playwright because bare HTTP often returns 500.
 *
 * Runbook:
 *   1. npm run discover:shuukh -- --max-pages 2
 *   2. npm run ingest:shuukh:canary
 *   3. Optional: --max 20
 *
 * Usage:
 *   npm run ingest:shuukh:canary
 *   npm run ingest:shuukh:canary -- --max 40
 */

import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";

import { contentSha256Hex, sha256Hex } from "@/engine/data/archive";
import {
  HttpShuukhCrawler,
  InMemoryKnowledgeCrawler,
  InMemoryKnowledgeRepository,
  JsonKnowledgeExporter,
  KnowledgeEngine,
  ParagraphKnowledgeChunker,
  RuleBasedKnowledgeMetadataExtractor,
  ShuukhJudgmentParser,
  UnicodeKnowledgeNormalizer,
  assertHttpsShuukhUrl,
  caseIdFromShuukhUrl,
} from "@/engine/knowledge";
import { createLegalArchiveStack } from "@/infrastructure/archive";
import { getPrismaClient } from "@/infrastructure/database/prisma-client";
import { PrismaKnowledgeRepository } from "@/infrastructure/repositories/prisma-legal-knowledge-repository";
import { env } from "@/lib/env";

const DEFAULT_MAX = 40;
const REQUEST_DELAY_MS = 400;
const TIMEOUT_MS = 45_000;

type ShuukhManifestDocument = {
  caseId: string;
  officialUrl: string;
  courtName: string | null;
  caseType?: number;
  instance?: number;
};

type ShuukhManifest = {
  source: string;
  documents: ShuukhManifestDocument[];
};

type Args = {
  max: number;
};

function parseArgs(argv: string[]): Args {
  const index = argv.indexOf("--max");
  const raw = index >= 0 ? argv[index + 1] : undefined;
  const max = raw ? Number(raw) : DEFAULT_MAX;
  return {
    max: Number.isFinite(max) ? Math.min(50, Math.max(1, max)) : DEFAULT_MAX,
  };
}

function redactDatabaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).host || "(unknown host)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function loadManifest(path: string): Promise<ShuukhManifest> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as ShuukhManifest;
  if (!Array.isArray(parsed.documents)) {
    throw new Error("shuukh manifest missing documents[]");
  }
  return parsed;
}

function createPlaywrightFetch(browser: Browser): typeof fetch {
  return async (input) => {
    const url = String(input);
    const page = await browser.newPage({
      userAgent:
        "TORE-Legal-AI-KnowledgeCrawler/1.0 (+https://tore.mn; legal-research)",
    });
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT_MS,
      });
      const status = response?.status() ?? 500;
      const body = await page.content();
      // Some judgments return HTTP 500 with usable HTML; accept body when it
      // contains holding text rather than failing on status alone.
      const usable =
        status < 400 ||
        /Дугаар|шийдвэр|зааснаар/i.test(body);
      return new Response(body, {
        status: usable ? 200 : status,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("shuukh.mn LOCAL Prisma canary ingest");
  console.log("===================================");

  const localEnv = {
    ...env,
    ARCHIVE_STORAGE: "local" as const,
  };
  if (env.ARCHIVE_STORAGE === "s3") {
    console.warn(
      "Note: .env ARCHIVE_STORAGE=s3 ignored for this command — using local archive.",
    );
  }

  const root = process.cwd();
  const manifestPath = join(root, "tmp", "shuukh-discovery-manifest.json");
  const reportPath = join(root, "tmp", "shuukh-canary-report.json");

  let manifest: ShuukhManifest;
  try {
    manifest = await loadManifest(manifestPath);
  } catch {
    console.error(`Manifest not found or invalid: ${manifestPath}`);
    console.error("Run: npm run discover:shuukh -- --max-pages 2");
    process.exit(1);
  }

  const selected = manifest.documents.slice(0, args.max);
  if (selected.length === 0) {
    console.error("No judgments in discovery manifest.");
    process.exit(1);
  }

  console.log(`DATABASE_URL host: ${redactDatabaseHost(env.DATABASE_URL)}`);
  console.log(`selected: ${selected.length} (max ${args.max})`);

  const stack = await createLegalArchiveStack({
    env: localEnv,
    usePostgresMetadata: true,
  });
  if (stack.storageKind !== "local" || stack.metadataKind !== "postgres") {
    console.error(
      `Unexpected stack: storage=${stack.storageKind} metadata=${stack.metadataKind}`,
    );
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const knowledgeRepository = new PrismaKnowledgeRepository(
    stack.archive,
    prisma,
  );
  const health = await stack.archive.health();
  if (!health.ok) {
    console.error(`Archive health failed: ${health.detail}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const playwrightFetch = createPlaywrightFetch(browser);

  const startedAt = new Date();
  const startedMs = Date.now();
  const outcomes: Array<{
    caseId: string;
    officialUrl: string;
    status: "SUCCESS" | "FAILED" | "SKIPPED";
    reason?: string;
    title?: string;
    articleCount?: number;
    chunkCount?: number;
    sha256?: string;
  }> = [];

  let success = 0;
  let failed = 0;
  let skipped = 0;

  try {
    for (const doc of selected) {
      const caseId = doc.caseId || caseIdFromShuukhUrl(doc.officialUrl);
      if (!caseId) {
        failed += 1;
        outcomes.push({
          caseId: doc.caseId,
          officialUrl: doc.officialUrl,
          status: "FAILED",
          reason: "missing caseId",
        });
        continue;
      }

      let officialUrl = doc.officialUrl;
      try {
        // Keep query params (id/court_cat/bb) — required by shuukh.mn detail pages.
        officialUrl = assertHttpsShuukhUrl(doc.officialUrl).toString();
      } catch (error) {
        failed += 1;
        outcomes.push({
          caseId,
          officialUrl: doc.officialUrl,
          status: "FAILED",
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const existing = await knowledgeRepository.findBySourceUrl(officialUrl);
      if (existing) {
        skipped += 1;
        outcomes.push({
          caseId,
          officialUrl,
          status: "SKIPPED",
          reason: "already ingested for this URL",
          title: existing.title,
        });
        continue;
      }

      const crawlErrors: string[] = [];
      const crawler = new HttpShuukhCrawler({
        archive: stack.archive,
        timeoutMs: TIMEOUT_MS,
        requestDelayMs: 0,
        maxRetries: 1,
        fetchImpl: playwrightFetch,
        onDocumentError: ({ error }) => {
          crawlErrors.push(
            error instanceof Error ? error.message : String(error),
          );
        },
      });

      try {
        const rawDocuments = await crawler.crawl({
          sourceId: "shuukh",
          urls: [officialUrl],
          maxDocuments: 1,
        });
        if (rawDocuments.length === 0) {
          failed += 1;
          outcomes.push({
            caseId,
            officialUrl,
            status: "FAILED",
            reason: crawlErrors[0] ?? "HTTP crawl returned no document",
          });
          continue;
        }

        const raw = rawDocuments[0]!;
        const rawHash = sha256Hex(raw.bytes);
        const canonicalHash = contentSha256Hex(raw.bytes);
        const archiveRecord =
          (await stack.archive.findByHash(rawHash)) ??
          (await stack.archive.findByContentHash(canonicalHash));
        if (!archiveRecord) {
          failed += 1;
          outcomes.push({
            caseId,
            officialUrl,
            status: "FAILED",
            reason: "missing archive checksum",
          });
          continue;
        }
        await stack.archive.verifyArchiveIntegrity(archiveRecord.sha256);

        const engine = new KnowledgeEngine({
          crawler: new InMemoryKnowledgeCrawler([raw]),
          parser: new ShuukhJudgmentParser(),
          normalizer: new UnicodeKnowledgeNormalizer(),
          metadata: new RuleBasedKnowledgeMetadataExtractor(),
          chunker: new ParagraphKnowledgeChunker(),
          repository: new InMemoryKnowledgeRepository(),
          exporter: new JsonKnowledgeExporter(),
        });

        const result = await engine.ingest({
          sourceId: "shuukh",
          urls: [officialUrl],
          maxDocuments: 1,
        });
        if (result.failed.length > 0 || !result.ingested[0]) {
          failed += 1;
          outcomes.push({
            caseId,
            officialUrl,
            status: "FAILED",
            reason: result.failed[0]?.reason ?? "ingestion produced no document",
          });
          continue;
        }

        const stored = result.ingested[0]!;
        await knowledgeRepository.save({
          ...stored,
          metadata: {
            ...stored.metadata,
            documentType: "COURT_JUDGMENT",
          },
          provenance: {
            archiveId: archiveRecord.archiveId,
            sha256: archiveRecord.sha256,
            contentSha256: archiveRecord.contentSha256,
            originalUrl: archiveRecord.originalUrl,
            lawId: caseId,
          },
        });

        success += 1;
        outcomes.push({
          caseId,
          officialUrl,
          status: "SUCCESS",
          title: stored.title,
          articleCount: stored.articles.length,
          chunkCount: stored.chunks.length,
          sha256: archiveRecord.contentSha256,
        });
        console.log(`OK ${caseId} — ${stored.title}`);
      } catch (error) {
        failed += 1;
        outcomes.push({
          caseId,
          officialUrl,
          status: "FAILED",
          reason: error instanceof Error ? error.message : String(error),
        });
        console.error(`FAIL ${caseId}:`, error);
      }

      if (REQUEST_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    }
  } finally {
    await browser.close();
  }

  const durationMs = Date.now() - startedMs;
  const report = {
    batch: "shuukh-canary-local-prisma",
    archiveStorage: "local",
    knowledgePersistence: "postgres",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs,
    manifestPath,
    max: args.max,
    selected: selected.length,
    totals: { success, failed, skipped },
    documents: outcomes,
  };

  await mkdir(join(root, "tmp"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("-------------------");
  console.log("SUCCESS", success);
  console.log("FAILED", failed);
  console.log("SKIPPED", skipped);
  console.log("DURATION", `${durationMs}ms`);
  console.log(`report: ${reportPath}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
