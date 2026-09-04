/**
 * Discover official shuukh.mn judgments into a resumable manifest.
 * Does NOT download judgment bodies / does NOT run full ingestion.
 *
 * Shell HTML at /cases/{type}/{instance} no longer embeds rows; the site
 * loads JSON from /site/case_ajax (`view` HTML fragment). Playwright opens
 * the list shell so case_ajax runs in a real browser session.
 *
 * Usage:
 *   npm run discover:shuukh
 *   npm run discover:shuukh -- --case-type 1 --instance 1 --max-pages 2
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import {
  SHUUKH_CASE_LISTS,
  parseShuukhCaseAjaxPayload,
  shuukhCaseAjaxUrl,
  shuukhCaseListUrl,
} from "../src/engine/knowledge";

type ManifestDocument = {
  caseId: string;
  officialUrl: string;
  courtName: string | null;
  caseType: number;
  instance: number;
};

type Args = {
  caseType: number | null;
  instance: number | null;
  maxPages: number;
  dateRange: string;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const caseTypeRaw = get("--case-type");
  const instanceRaw = get("--instance");
  const maxPagesRaw = get("--max-pages");
  const rangeStart = argv.indexOf("--daterange");
  let dateRange = "2024/01/01 - 2026/12/31";
  if (rangeStart >= 0) {
    // Allow: --daterange 2024/01/01 - 2026/12/31  (spaces without quotes)
    const parts: string[] = [];
    for (let i = rangeStart + 1; i < argv.length; i += 1) {
      const token = argv[i]!;
      if (token.startsWith("--")) break;
      parts.push(token);
    }
    if (parts.length > 0) {
      dateRange = parts.join(" ");
    }
  }
  return {
    caseType: caseTypeRaw ? Number(caseTypeRaw) : null,
    instance: instanceRaw ? Number(instanceRaw) : null,
    maxPages: maxPagesRaw ? Math.max(1, Number(maxPagesRaw)) : 50,
    dateRange,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lists = SHUUKH_CASE_LISTS.filter((list) => {
    if (args.caseType != null && list.caseType !== args.caseType) return false;
    if (args.instance != null && list.instance !== args.instance) return false;
    return true;
  });

  const root = process.cwd();
  const outDir = join(root, "tmp");
  const manifestPath = join(outDir, "shuukh-discovery-manifest.json");
  await mkdir(outDir, { recursive: true });

  console.log("shuukh.mn discovery (Playwright + case_ajax JSON)");
  console.log("================================================");
  console.log(`lists: ${lists.map((l) => `${l.caseType}/${l.instance}`).join(", ")}`);
  console.log(`daterange: ${args.dateRange}`);
  console.log(`max pages per list: ${args.maxPages}`);

  const documents: ManifestDocument[] = [];
  const seen = new Set<string>();

  // Resume: keep prior caseIds so civil + criminal canaries accumulate.
  try {
    const priorRaw = await readFile(manifestPath, "utf8");
    const prior = JSON.parse(priorRaw) as { documents?: ManifestDocument[] };
    for (const row of prior.documents ?? []) {
      if (!row?.caseId || seen.has(row.caseId)) continue;
      seen.add(row.caseId);
      documents.push({
        caseId: row.caseId,
        officialUrl: row.officialUrl,
        courtName: row.courtName ?? null,
        caseType: row.caseType,
        instance: row.instance,
      });
    }
    if (documents.length > 0) {
      console.log(`resumed ${documents.length} prior judgment(s) from manifest`);
    }
  } catch {
    // First run — empty manifest is fine.
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent:
        "TORE-Legal-AI-KnowledgeCrawler/1.0 (+https://tore.mn; legal-research)",
    });

    // Warm session cookies once.
    await page.goto(shuukhCaseListUrl(1, 1), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    for (const list of lists) {
      for (let pageNo = 1; pageNo <= args.maxPages; pageNo += 1) {
        const ajaxUrl = shuukhCaseAjaxUrl({
          caseType: list.caseType,
          instance: list.instance,
          page: pageNo,
          dateRange: args.dateRange,
        });

        const payload = await page.evaluate(async (url: string) => {
          const response = await fetch(url, {
            headers: { "X-Requested-With": "XMLHttpRequest" },
          });
          if (!response.ok) {
            throw new Error(`case_ajax HTTP ${response.status}`);
          }
          return response.text();
        }, ajaxUrl);

        const items = parseShuukhCaseAjaxPayload(payload);
        if (items.length === 0) {
          console.log(
            `${list.mnLabel} page ${pageNo}: 0 judgments (empty — stop this list)`,
          );
          break;
        }

        let added = 0;
        for (const item of items) {
          if (seen.has(item.caseId)) continue;
          seen.add(item.caseId);
          documents.push({
            caseId: item.caseId,
            officialUrl: item.officialUrl,
            courtName: item.courtName,
            caseType: list.caseType,
            instance: list.instance,
          });
          added += 1;
        }
        console.log(
          `${list.mnLabel} page ${pageNo}: ${items.length} rows, ${added} new`,
        );
        if (items.length < 5) {
          break;
        }
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    source: "shuukh.mn",
    createdAt: new Date().toISOString(),
    dateRange: args.dateRange,
    documentCount: documents.length,
    documents,
    note: "Discovery via Playwright case_ajax JSON view. Judgment HTML ingest is separate. legaldata.mn is not used.",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("-------------------");
  console.log(`documents discovered: ${documents.length}`);
  console.log(`manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
