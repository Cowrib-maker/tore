import type { ArchiveService } from "@/engine/data/archive";
import {
  KnowledgeDocumentKind,
  type IKnowledgeCrawler,
  type KnowledgeCrawlJob,
  type RawKnowledgeDocument,
} from "../types";
import {
  KnowledgeCrawlError,
  LEGALINFO_CONSTITUTION_LAW_ID,
  assertHttpsLegalInfoUrl,
  isLegalInfoHostname,
  lawIdFromLegalInfoUrl,
  legalInfoDetailUrl,
} from "./legalinfo-url";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type HttpKnowledgeCrawlerOptions = {
  /**
   * Default law ids when `job.urls` is omitted.
   * Defaults to the 1992 Constitution (`367`).
   */
  lawIds?: readonly string[];
  locale?: string;
  /** Request timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** Max response body size in bytes. Default 10 MiB. */
  maxBytes?: number;
  /** Retries after the first attempt. Default 3. */
  maxRetries?: number;
  userAgent?: string;
  /** Injectable fetch for tests. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
  /**
   * Optional pause between document fetches (ms). Default 0.
   * Used by multi-law verification to avoid flooding LegalInfo.
   */
  requestDelayMs?: number;
  /**
   * Called when a single URL fails after retries. The crawl continues
   * with remaining URLs (one failure does not abort the job).
   */
  onDocumentError?: (info: {
    sourceUrl: string;
    error: unknown;
  }) => void;
  /**
   * Optional raw-byte archive. Failures here do not fail the crawl document.
   */
  archive?: ArchiveService;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_USER_AGENT =
  "TORE-Legal-AI-KnowledgeCrawler/1.0 (+https://tore.mn; legal-research)";
const MAX_REDIRECTS = 5;
const ALLOWED_MEDIA = new Set(["text/html", "application/xhtml+xml"]);

/**
 * Production {@link IKnowledgeCrawler} for LegalInfo.mn official HTML pages.
 *
 * Inject via {@link createKnowledgeEngine} — the default composition still
 * uses {@link InMemoryKnowledgeCrawler}. Per-URL fetch failures are skipped
 * so one bad document cannot abort the whole crawl job.
 */
export class HttpKnowledgeCrawler implements IKnowledgeCrawler {
  private readonly lawIds: readonly string[];
  private readonly locale: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRetries: number;
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;
  private readonly requestDelayMs: number;
  private readonly onDocumentError:
    | ((info: { sourceUrl: string; error: unknown }) => void)
    | undefined;
  private readonly archive: ArchiveService | undefined;

  constructor(options: HttpKnowledgeCrawlerOptions = {}) {
    this.lawIds = options.lawIds ?? [LEGALINFO_CONSTITUTION_LAW_ID];
    this.locale = options.locale ?? "mn";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestDelayMs = Math.max(0, options.requestDelayMs ?? 0);
    this.onDocumentError = options.onDocumentError;
    this.archive = options.archive;
  }

  async crawl(job: KnowledgeCrawlJob): Promise<RawKnowledgeDocument[]> {
    const targets = this.resolveTargets(job);
    const limited =
      typeof job.maxDocuments === "number"
        ? targets.slice(0, Math.max(0, job.maxDocuments))
        : targets;

    const documents: RawKnowledgeDocument[] = [];
    for (let index = 0; index < limited.length; index += 1) {
      const url = limited[index]!;
      try {
        const document = await this.fetchDocument(job.sourceId, url);
        documents.push(document);
      } catch (error) {
        this.onDocumentError?.({ sourceUrl: url, error });
        console.error("HttpKnowledgeCrawler: document fetch failed", {
          sourceUrl: url,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      if (this.requestDelayMs > 0 && index < limited.length - 1) {
        await sleep(this.requestDelayMs);
      }
    }
    return documents;
  }

  private resolveTargets(job: KnowledgeCrawlJob): string[] {
    if (job.urls?.length) {
      return job.urls.map((url) => assertHttpsLegalInfoUrl(url).toString());
    }
    return this.lawIds.map((lawId) => legalInfoDetailUrl(lawId, this.locale));
  }

  private async fetchDocument(
    sourceId: string,
    startUrl: string,
  ): Promise<RawKnowledgeDocument> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const fetched = await this.fetchOnce(startUrl);
        const document: RawKnowledgeDocument = {
          sourceId,
          sourceUrl: startUrl,
          kind: KnowledgeDocumentKind.HTML,
          bytes: fetched.bytes,
          contentType: fetched.contentType,
          fetchedAt: new Date(),
        };
        await this.maybeArchive(document);
        return document;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt >= this.maxRetries) {
          break;
        }
        await sleep(backoffMs(attempt + 1));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new KnowledgeCrawlError("network", String(lastError));
  }

  private async fetchOnce(
    startUrl: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    let current = assertHttpsLegalInfoUrl(startUrl).toString();

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = assertHttpsLegalInfoUrl(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await this.fetchImpl(parsed.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": this.userAgent,
            Accept:
              "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          },
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new KnowledgeCrawlError(
            "timeout",
            `Request timed out after ${this.timeoutMs}ms: ${parsed.toString()}`,
          );
        }
        throw new KnowledgeCrawlError(
          "network",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        clearTimeout(timer);
      }

      if (isRedirectStatus(response.status)) {
        if (hop === MAX_REDIRECTS) {
          throw new KnowledgeCrawlError("redirect", "Too many redirects");
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new KnowledgeCrawlError(
            "redirect",
            "Redirect missing Location header",
          );
        }
        let next: URL;
        try {
          next = new URL(location, parsed);
        } catch {
          throw new KnowledgeCrawlError(
            "redirect",
            "Redirect Location is not a valid URL",
          );
        }
        if (next.protocol !== "https:") {
          throw new KnowledgeCrawlError(
            "https_only",
            `Redirect must stay on HTTPS: ${next.toString()}`,
          );
        }
        if (!isLegalInfoHostname(next.hostname)) {
          throw new KnowledgeCrawlError(
            "domain",
            `Redirect blocked outside legalinfo.mn: ${next.toString()}`,
          );
        }
        current = next.toString();
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new KnowledgeCrawlError(
          "http_status",
          `HTTP ${response.status} for ${parsed.toString()}`,
        );
      }

      const contentTypeHeader =
        response.headers.get("content-type") ?? "application/octet-stream";
      const media =
        contentTypeHeader.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!ALLOWED_MEDIA.has(media)) {
        throw new KnowledgeCrawlError(
          "content_type",
          `Expected text/html or application/xhtml+xml, got ${media || "unknown"}`,
        );
      }

      const declared = Number.parseInt(
        response.headers.get("content-length") ?? "",
        10,
      );
      if (Number.isFinite(declared) && declared > this.maxBytes) {
        throw new KnowledgeCrawlError(
          "too_large",
          `Response exceeds size limit of ${this.maxBytes} bytes`,
        );
      }

      const bytes = await readLimitedBody(response, this.maxBytes);
      return { bytes, contentType: contentTypeHeader };
    }

    throw new KnowledgeCrawlError("redirect", "Too many redirects");
  }

  private async maybeArchive(document: RawKnowledgeDocument): Promise<void> {
    if (!this.archive) {
      return;
    }
    try {
      await this.archive.store({
        bytes: document.bytes,
        connectorId: "mn.legalinfo",
        source: "legalinfo.mn",
        sourceId: document.sourceId,
        lawId: lawIdFromLegalInfoUrl(document.sourceUrl),
        jurisdiction: "MN",
        authority: "LEGALINFO",
        sourceType: "law",
        originalUrl: document.sourceUrl,
        originalFileName: "legalinfo-detail.html",
        mimeType: document.contentType ?? "text/html",
        encoding: "utf-8",
        fetchedAt: document.fetchedAt.toISOString(),
      });
    } catch (error) {
      console.error("HttpKnowledgeCrawler: archive store failed", {
        sourceUrl: document.sourceUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof KnowledgeCrawlError)) {
    return true;
  }
  return (
    error.code === "timeout" ||
    error.code === "network" ||
    (error.code === "http_status" && /HTTP (429|5\d\d)/.test(error.message))
  );
}

function backoffMs(attempt: number): number {
  const base = 250 * 2 ** (attempt - 1);
  return Math.min(base, 4_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new KnowledgeCrawlError(
        "too_large",
        `Response exceeds size limit of ${maxBytes} bytes`,
      );
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new KnowledgeCrawlError(
        "too_large",
        `Response exceeds size limit of ${maxBytes} bytes`,
      );
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
