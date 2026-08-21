/**
 * Live verification: fetch exactly 50 known LegalInfo laws through the
 * shared batch verification runner (same path as the 5-law verify).
 *
 * HttpKnowledgeCrawler → archive/SHA-256 → LegalInfoKnowledgeParser →
 * normalize → metadata → chunk → in-memory repository.
 *
 * - Does not change createKnowledgeEngine() defaults
 * - Sequential crawl + delay (does not flood LegalInfo)
 * - One failure does not abort the remaining laws
 * - Writes a machine-readable JSON report under tmp/
 *
 * Usage:
 *   npx tsx scripts/verify-legalinfo-50.ts
 *   npm run verify:legalinfo-50
 */

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LEGALINFO_VERIFY_50_LAW_IDS,
} from "../src/engine/knowledge";
import { runLegalInfoBatchVerify } from "./lib/legalinfo-batch-verify";

async function main() {
  if (LEGALINFO_VERIFY_50_LAW_IDS.length !== 50) {
    throw new Error(
      `LEGALINFO_VERIFY_50_LAW_IDS must contain exactly 50 ids, got ${LEGALINFO_VERIFY_50_LAW_IDS.length}`,
    );
  }

  const archiveDir = await mkdtemp(join(tmpdir(), "tore-legalinfo-50-"));
  await mkdir("tmp", { recursive: true });
  const reportPath = join(process.cwd(), "tmp", "legalinfo-50-report.json");

  console.log("LegalInfo 50-law verification");
  console.log("=============================");
  console.log(`laws: ${LEGALINFO_VERIFY_50_LAW_IDS.length}`);
  console.log(`control lawId: 367`);
  console.log(`archive dir (temp): ${archiveDir}`);
  console.log(`JSON report: ${reportPath}`);
  console.log(
    "concurrency: 1 (sequential HttpKnowledgeCrawler) + 300ms inter-request delay",
  );

  let exitCode = 0;
  try {
    const { summary } = await runLegalInfoBatchVerify({
      lawIds: LEGALINFO_VERIFY_50_LAW_IDS,
      expectedCount: 50,
      archiveDir,
      reportPath,
      // Polite sequential pacing — crawler remains single-flight per URL.
      requestDelayMs: 300,
      timeoutMs: 90_000,
    });

    if (summary.total !== 50) {
      exitCode = 1;
    }
    if (summary.failed > 0 || summary.duplicates > 0) {
      exitCode = 1;
    }
  } catch (error) {
    console.log("ingestion status: FAILURE");
    console.log(
      `reason: ${error instanceof Error ? error.message : String(error)}`,
    );
    exitCode = 1;
  } finally {
    await rm(archiveDir, { recursive: true, force: true }).catch(() => undefined);
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
