/**
 * Official shuukh.mn judgment URLs.
 *
 * List pages: https://shuukh.mn/cases/{caseType}/{instance}
 * List AJAX: https://shuukh.mn/site/case_ajax?id={caseType}&court_cat={instance}&…
 * Detail pages: https://shuukh.mn/single_case/{id}
 * Do not scrape legaldata.mn.
 */

import { KnowledgeCrawlError } from "./legalinfo-url";

export const SHUUKH_HOST = "shuukh.mn";

export type ShuukhCaseList = {
  readonly caseType: 1 | 2 | 3;
  readonly instance: 1 | 2 | 3;
  readonly mnLabel: string;
};

/** Civil / criminal / administrative × first / appeal / cassation. */
export const SHUUKH_CASE_LISTS: readonly ShuukhCaseList[] = [
  { caseType: 1, instance: 1, mnLabel: "Иргэний хэргийн анхан шатны шүүх" },
  { caseType: 1, instance: 2, mnLabel: "Иргэний хэргийн давж заалдах шатны шүүх" },
  { caseType: 1, instance: 3, mnLabel: "Иргэний хэргийн хяналтын шатны шүүх" },
  { caseType: 2, instance: 1, mnLabel: "Эрүүгийн хэргийн анхан шатны шүүх" },
  { caseType: 2, instance: 2, mnLabel: "Эрүүгийн хэргийн давж заалдах шатны шүүх" },
  { caseType: 2, instance: 3, mnLabel: "Эрүүгийн хэргийн хяналтын шатны шүүх" },
  { caseType: 3, instance: 1, mnLabel: "Захиргааны хэргийн анхан шатны шүүх" },
  { caseType: 3, instance: 2, mnLabel: "Захиргааны хэргийн давж заалдах шатны шүүх" },
  { caseType: 3, instance: 3, mnLabel: "Захиргааны хэргийн хяналтын шатны шүүх" },
] as const;

export type ShuukhListItem = {
  caseId: string;
  officialUrl: string;
  courtName: string | null;
};

export type ShuukhJudgment = {
  caseId: string;
  officialUrl: string;
  title: string;
  caseNumber: string | null;
  courtName: string | null;
  decidedOn: string | null;
  text: string;
};

export function isShuukhHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === SHUUKH_HOST || host.endsWith(`.${SHUUKH_HOST}`);
}

export function shuukhCaseListUrl(caseType: number, instance: number): string {
  return `https://${SHUUKH_HOST}/cases/${caseType}/${instance}`;
}

/**
 * Official list fragment endpoint used by shuukh.mn after the shell HTML loads.
 * Static `/cases/{type}/{instance}` HTML no longer embeds judgment rows.
 */
export function shuukhCaseAjaxUrl(options: {
  caseType: number;
  instance: number;
  page?: number;
  dateRange?: string;
}): string {
  const url = new URL(`https://${SHUUKH_HOST}/site/case_ajax`);
  url.searchParams.set("id", String(options.caseType));
  url.searchParams.set("court_cat", String(options.instance));
  url.searchParams.set("bb", "1");
  url.searchParams.set("page", String(options.page ?? 1));
  url.searchParams.set(
    "daterange",
    options.dateRange ?? "2015/01/01 - 2026/12/31",
  );
  url.searchParams.set("keyword", "");
  url.searchParams.set("court", "");
  url.searchParams.set("index_number", "");
  url.searchParams.set("number", "");
  url.searchParams.set("is_active", "");
  return url.toString();
}

export function shuukhJudgmentUrl(caseId: string): string {
  const id = caseId.trim();
  if (!id) {
    throw new Error("shuukh caseId is required");
  }
  return `https://${SHUUKH_HOST}/single_case/${encodeURIComponent(id)}`;
}

export function caseIdFromShuukhUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isShuukhHostname(parsed.hostname)) {
      return null;
    }
    const match = parsed.pathname.match(/^\/single_case\/(\d+)\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertHttpsShuukhUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new KnowledgeCrawlError("invalid_url", `Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new KnowledgeCrawlError("https_only", `Only HTTPS is allowed: ${url}`);
  }
  if (!isShuukhHostname(parsed.hostname)) {
    throw new KnowledgeCrawlError(
      "domain",
      `Only ${SHUUKH_HOST} is allowed: ${url}`,
    );
  }
  return parsed;
}

/**
 * Extract official judgment links from a shuukh.mn `/cases/{type}/{instance}`
 * HTML table (or the HTML fragment inside case_ajax JSON `view`).
 * Does not invent case ids.
 */
export function parseShuukhListHtml(html: string): ShuukhListItem[] {
  const items: ShuukhListItem[] = [];
  const seen = new Set<string>();
  const named =
    /<a\b([^>]*\bclass=["'][^"']*act-name[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = named.exec(html))) {
    const attrs = match[1] ?? "";
    const href = attrs.match(/href=["'](\/single_case\/\d+[^"']*)["']/i)?.[1];
    if (!href) continue;
    const caseId = href.match(/\/single_case\/(\d+)/i)?.[1];
    if (!caseId || seen.has(caseId)) continue;
    seen.add(caseId);
    items.push({
      caseId,
      officialUrl: absolutizeShuukhHref(href),
      courtName: decodeHtml(stripTags(match[2] ?? "")).trim() || null,
    });
  }
  if (items.length === 0) {
    const loose = /href=["'](\/single_case\/\d+[^"']*)["']/gi;
    while ((match = loose.exec(html))) {
      const href = match[1]!;
      const caseId = href.match(/\/single_case\/(\d+)/i)?.[1];
      if (!caseId || seen.has(caseId)) continue;
      seen.add(caseId);
      items.push({
        caseId,
        officialUrl: absolutizeShuukhHref(href),
        courtName: null,
      });
    }
  }
  return items;
}

/** Detail pages require id/court_cat/bb query params; bare /single_case/{id} returns 500. */
function absolutizeShuukhHref(href: string): string {
  try {
    return new URL(href, `https://${SHUUKH_HOST}`).toString();
  } catch {
    return shuukhJudgmentUrl(href.match(/\/single_case\/(\d+)/i)?.[1] ?? "");
  }
}

/**
 * Parse `/site/case_ajax` JSON payloads (`{ view, pagination_link, count }`).
 * Falls back to treating the body as HTML if it is not JSON.
 */
export function parseShuukhCaseAjaxPayload(body: string): ShuukhListItem[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { view?: unknown };
      if (typeof parsed.view === "string") {
        return parseShuukhListHtml(parsed.view);
      }
    } catch {
      // fall through to HTML parse
    }
  }
  return parseShuukhListHtml(trimmed);
}

/**
 * Pull court name, case number, and printed holding from a shuukh detail page.
 * Numbering is copied from the source; nothing is invented.
 */
export function parseShuukhJudgmentHtml(
  html: string,
  officialUrl: string,
): ShuukhJudgment {
  const caseId = caseIdFromShuukhUrl(officialUrl) ?? "";
  // Drop head/meta so site chrome is not mistaken for the court name.
  const bodyHtml = html.replace(/<head[\s\S]*?<\/head>/i, " ");
  const caseNumber =
    firstMatch(bodyHtml, /Дугаар\s*<\/[^>]+>\s*([^<]+)/i)?.trim() ??
    firstMatch(bodyHtml, /Дугаар\s+([0-9A-Za-zА-Яа-яЁёҮүӨө/]+)/)?.trim() ??
    null;
  const courtName =
    firstMatch(
      bodyHtml,
      /Шийдвэрийн\s+мэдээлэл[\s\S]{0,400}?<p[^>]*>\s*([^<]*шүүх[^<]*)/i,
    )
      ?.replace(/\s+/g, " ")
      .trim() ??
    firstMatch(
      bodyHtml,
      /<(?:h1|h2|h3|h4|h5|h6)[^>]*>\s*([^<]*шүүх[^<]*)/i,
    )
      ?.replace(/\s+/g, " ")
      .trim() ??
    null;
  const decidedOn =
    firstMatch(
      bodyHtml,
      /(\d{4}\s*оны\s*\d{1,2}\s*сарын\s*\d{1,2}\s*өдөр)/,
    )?.trim() ?? null;

  const body = extractJudgmentBody(bodyHtml);
  const titleParts = [courtName, caseNumber].filter(Boolean);
  const title =
    titleParts.length > 0
      ? titleParts.join(" — ")
      : `Шүүхийн шийдвэр ${caseId}`.trim();

  return {
    caseId,
    officialUrl,
    title,
    caseNumber,
    courtName,
    decidedOn,
    text: body,
  };
}

function extractJudgmentBody(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const paragraphs = [
    ...stripped.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi),
  ]
    .map((m) => decodeHtml(stripTags(m[1] ?? "")).replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12);
  if (paragraphs.length > 0) {
    return paragraphs.join("\n");
  }
  return decodeHtml(stripTags(stripped)).replace(/\s+/g, " ").trim();
}

function firstMatch(text: string, re: RegExp): string | null {
  const match = text.match(re);
  return match?.[1] ?? null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
