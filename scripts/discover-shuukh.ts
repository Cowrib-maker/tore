/**
 * Discover official shuukh.mn judgments into a resumable manifest.
 * Does NOT download judgment bodies / does NOT run full ingestion.
 *
 * Usage:
 *   npm run discover:shuukh
 *   npm run discover:shuukh -- --case-type 1 --instance 1 --max-pages 2
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  SHUUKH_CASE_LISTS,
  parseShuukhListHtml,
  shuukhCaseListUrl,
} from "../src/engine/knowledge";

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
  return {
    caseType: caseTypeRaw ? Number(caseTypeRaw) : null,
    instance: instanceRaw ? Number(instanceRaw) : null,
    maxPages: maxPagesRaw ? Math.max(1, Number(maxPagesRaw)) : 50,
    dateRange: get("--daterange") ?? "2015/01/01 - 2026/12/31",
  };
}

async function fetchListPage(
  listUrl: string,
  dateRange: string,
  page: number,
): Promise<string> {
  const url = new URL(listUrl);
  url.searchParams.set("daterange", dateRange);
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent":
        "TORE-Legal-AI-KnowledgeCrawler/1.0 (+https://tore.mn; legal-research)",
      Accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url.toString()}`);
  }
  return response.text();
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

  console.log("shuukh.mn discovery");
  console.log("===================");
  console.log(`lists: ${lists.map((l) => `${l.caseType}/${l.instance}`).join(", ")}`);
  console.log(`daterange: ${args.dateRange}`);
  console.log(`max pages per list: ${args.maxPages}`);

  const documents: Array<{
    caseId: string;
    officialUrl: string;
    courtName: string | null;
    caseType: number;
    instance: number;
  }> = [];
  const seen = new Set<string>();

  for (const list of lists) {
    const listUrl = shuukhCaseListUrl(list.caseType, list.instance);
    for (let page = 1; page <= args.maxPages; page += 1) {
      const html = await fetchListPage(listUrl, args.dateRange, page);
      const items = parseShuukhListHtml(html);
      if (items.length === 0) {
        console.log(
          `${list.mnLabel} page ${page}: 0 judgments (empty page — stop this list)`,
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
        `${list.mnLabel} page ${page}: ${items.length} rows, ${added} new`,
      );
      if (items.length < 10) {
        break;
      }
    }
  }

  const manifest = {
    source: "shuukh.mn",
    createdAt: new Date().toISOString(),
    dateRange: args.dateRange,
    documentCount: documents.length,
    documents,
    note: "Discovery only. Judgment HTML ingest is a separate cloud job. legaldata.mn is not used.",
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
