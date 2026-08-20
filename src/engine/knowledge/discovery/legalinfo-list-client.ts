import {
  KnowledgeCrawlError,
  LEGALINFO_DEFAULT_LOCALE,
  assertHttpsLegalInfoUrl,
  legalInfoAjaxListUrl,
  legalInfoDetailUrl,
} from "../crawler/legalinfo-url";
import type { FetchLike } from "../crawler/http-knowledge-crawler";

export type LegalInfoListItem = {
  lawId: string;
  officialUrl: string;
  title: string | null;
};

export type LegalInfoListPage = {
  categoryId: string;
  page: number;
  totalPages: number;
  totalCount: number;
  items: LegalInfoListItem[];
  rawHtml: string;
};

export type LegalInfoListClientOptions = {
  fetchImpl?: FetchLike;
  locale?: string;
  timeoutMs?: number;
  userAgent?: string;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT =
  "TORE-Legal-AI-KnowledgeCrawler/1.0 (+https://tore.mn; legal-research)";

/**
 * Official LegalInfo category list client (POST /mn/ajaxList/).
 * Does not fetch detail pages.
 */
export class LegalInfoListClient {
  private readonly fetchImpl: FetchLike;
  private readonly locale: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: LegalInfoListClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.locale = options.locale ?? LEGALINFO_DEFAULT_LOCALE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async fetchPage(
    categoryId: string,
    page: number,
  ): Promise<LegalInfoListPage> {
    const id = categoryId.trim();
    if (!id) {
      throw new KnowledgeCrawlError("invalid_url", "categoryId is required");
    }
    if (!Number.isFinite(page) || page < 1) {
      throw new KnowledgeCrawlError("invalid_url", `Invalid page: ${page}`);
    }

    const endpoint = assertHttpsLegalInfoUrl(
      legalInfoAjaxListUrl(this.locale),
    ).toString();
    const body = new URLSearchParams({
      filtercategorytypeid: id,
      isactive: "1",
      page: String(page),
      sort: "title",
      sortType: "asc",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `https://legalinfo.mn/${this.locale}/law/${encodeURIComponent(id)}`,
        },
        body: body.toString(),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new KnowledgeCrawlError(
          "timeout",
          `Request timed out after ${this.timeoutMs}ms: ${endpoint}`,
        );
      }
      throw new KnowledgeCrawlError(
        "network",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new KnowledgeCrawlError(
        "http_status",
        `HTTP ${response.status} for ${endpoint}`,
      );
    }

    const text = await response.text();
    let html = text;
    try {
      const parsed = JSON.parse(text) as { Html?: string };
      if (typeof parsed.Html === "string") {
        html = parsed.Html;
      }
    } catch {
      // Some responses may already be HTML.
    }

    const items = parseLegalInfoListHtml(html);
    const { totalPages, totalCount } = parseListPagination(html, items.length);

    return {
      categoryId: id,
      page,
      totalPages,
      totalCount,
      items,
      rawHtml: html,
    };
  }
}

/**
 * Extract detail links from LegalInfo list HTML fragments.
 */
export function parseLegalInfoListHtml(html: string): LegalInfoListItem[] {
  const items: LegalInfoListItem[] = [];
  const seen = new Set<string>();
  const re =
    /href=["']https?:\/\/legalinfo\.mn\/(?:mn|en)\/detail\?lawId=(\d+)["'][^>]*class=["'][^"']*act-name[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const lawId = match[1]!;
    if (seen.has(lawId)) {
      continue;
    }
    seen.add(lawId);
    const title = decodeEntities(match[2] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    items.push({
      lawId,
      officialUrl: legalInfoDetailUrl(lawId),
      title: title.length > 0 ? title : null,
    });
  }

  // Fallback: any detail?lawId= link if act-name markup changes.
  if (items.length === 0) {
    const loose = /detail\?lawId=(\d+)/gi;
    while ((match = loose.exec(html))) {
      const lawId = match[1]!;
      if (seen.has(lawId)) {
        continue;
      }
      seen.add(lawId);
      items.push({
        lawId,
        officialUrl: legalInfoDetailUrl(lawId),
        title: null,
      });
    }
  }

  return items;
}

function parseListPagination(
  html: string,
  fallbackItemCount: number,
): { totalPages: number; totalCount: number } {
  const totalMatch = html.match(/Нийт\s+(\d+)/i);
  const totalCount = totalMatch
    ? Number.parseInt(totalMatch[1]!, 10)
    : fallbackItemCount;

  const pageMatch = html.match(/>(\d+)\s*\/\s*(\d+)</);
  const totalPagesFromLabel = pageMatch
    ? Number.parseInt(pageMatch[2]!, 10)
    : null;

  const pageButtons = [
    ...html.matchAll(/ajaxPage\((\d+)\)/g),
  ].map((m) => Number.parseInt(m[1]!, 10));
  const maxButton = pageButtons.length > 0 ? Math.max(...pageButtons) : 1;

  const totalPages =
    totalPagesFromLabel && totalPagesFromLabel > 0
      ? totalPagesFromLabel
      : Math.max(1, maxButton);

  return {
    totalPages,
    totalCount: Number.isFinite(totalCount) ? totalCount : fallbackItemCount,
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    );
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}
