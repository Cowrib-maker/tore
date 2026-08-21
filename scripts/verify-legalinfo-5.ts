/**
 * Local verification: fetch LegalInfo lawId=367 (1992 Constitution)
 * plus 4 known statutes through the shared batch verification runner.
 *
 * - Does not change createKnowledgeEngine() defaults
 * - Uses in-memory repository + temp archive only (non-destructive)
 * - Network required
 *
 * Usage:
 *   npx tsx scripts/verify-legalinfo-5.ts
 *   npm run verify:legalinfo-5
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LEGALINFO_VERIFY_LAW_IDS,
} from "../src/engine/knowledge";
import { runLegalInfoBatchVerify } from "./lib/legalinfo-batch-verify";

async function main() {
  const archiveDir = await mkdtemp(join(tmpdir(), "tore-legalinfo-5-"));
  const reportPath = join(archiveDir, "legalinfo-5-report.json");

  console.log("LegalInfo 5-law verification");
  console.log("============================");
  console.log(`laws: ${LEGALINFO_VERIFY_LAW_IDS.join(", ")}`);
  console.log(`archive dir (temp): ${archiveDir}`);

  let exitCode = 0;
  try {
    const { summary } = await runLegalInfoBatchVerify({
      lawIds: LEGALINFO_VERIFY_LAW_IDS,
      expectedCount: 5,
      archiveDir,
      reportPath,
      requestDelayMs: 250,
      timeoutMs: 60_000,
    });
    if (summary.failed > 0 || summary.duplicates > 0 || summary.success !== 5) {
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
