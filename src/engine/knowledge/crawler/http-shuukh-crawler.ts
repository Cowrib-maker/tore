import type { ArchiveService } from "@/engine/data/archive";
import {
  KnowledgeDocumentKind,
  type IKnowledgeCrawler,
  type KnowledgeCrawlJob,
  type RawKnowledgeDocument,
} from "../types";
import { KnowledgeCrawlError } from "./legalinfo-url";
import {
  assertHttpsShuukhUrl,
  caseIdFromShuukhUrl,
  isShuukhHostname,
} from "./shuukh-url";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type HttpShuukhCrawlerOptions = {
  /** Request timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** Max response body size in bytes. Default 10 MiB. */
  maxBytes?: number;
  /** Retries after the first attempt. Default 3. */
  maxRetries?: number;
  userAgent?: string;
  fetchImpl?: FetchLike;
  requestDelayMs?: number;
  onDocumentError?: (info: {
    sourceUrl: string;
    error: unknown;
  }) => void;
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
 * HTTPS crawler for official shuukh.mn judgment detail pages.
 * Does not touch legaldata.mn. Inject archive for durable provenance.
 */
export class HttpShuukhCrawler implements IKnowledgeCrawler {
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

  constructor(options: HttpShuukhCrawlerOptions = {}) {
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
    const targets = job.urls ?? [];
    if (targets.length === 0) {
      throw new KnowledgeCrawlError(
        "invalid_url",
        "HttpShuukhCrawler requires job.urls (shuukh judgment detail URLs)",
      );
    }
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
        console.error("HttpShuukhCrawler: document fetch failed", {
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

  private async fetchDocument(
    sourceId: string,
    url: string,
  ): Promise<RawKnowledgeDocument> {
    assertHttpsShuukhUrl(url);
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        const { bytes, contentType } = await this.fetchOnce(url);
        const document: RawKnowledgeDocument = {
          sourceId,
          sourceUrl: url,
          kind: KnowledgeDocumentKind.HTML,
          bytes,
          contentType,
          fetchedAt: new Date(),
        };
        await this.maybeArchive(document);
        return document;
      } catch (error) {
        lastError = error;
        if (attempt <= this.maxRetries && isRetryable(error)) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new KnowledgeCrawlError("network", String(lastError));
  }

  private async fetchOnce(
    url: string,
  ): Promise<{ bytes: Uint8Array; contentType?: string }> {
    let current = assertHttpsShuukhUrl(url);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(current.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": this.userAgent,
            Accept: "text/html,application/xhtml+xml",
          },
        });
      } catch (error) {
        clearTimeout(timer);
        if (isAbortError(error)) {
          throw new KnowledgeCrawlError(
            "timeout",
            `Request timed out after ${this.timeoutMs}ms`,
          );
        }
        throw new KnowledgeCrawlError(
          "network",
          error instanceof Error ? error.message : String(error),
        );
      }
      clearTimeout(timer);

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new KnowledgeCrawlError(
            "redirect",
            `Redirect without Location from ${current.toString()}`,
          );
        }
        const next = new URL(location, current);
        if (!isShuukhHostname(next.hostname)) {
          throw new KnowledgeCrawlError(
            "domain",
            `Redirect blocked outside shuukh.mn: ${next.toString()}`,
          );
        }
        if (next.protocol !== "https:") {
          throw new KnowledgeCrawlError(
            "https_only",
            `Redirect to non-HTTPS blocked: ${next.toString()}`,
          );
        }
        current = next;
        continue;
      }

      if (!response.ok) {
        throw new KnowledgeCrawlError(
          "http_status",
          `HTTP ${response.status} for ${current.toString()}`,
        );
      }

      const contentTypeHeader = response.headers.get("content-type") ?? undefined;
      const media = contentTypeHeader?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (media && !ALLOWED_MEDIA.has(media)) {
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
    if (!this.archive) return;
    try {
      await this.archive.store({
        bytes: document.bytes,
        connectorId: "mn.shuukh",
        source: "shuukh.mn",
        sourceId: document.sourceId,
        lawId: caseIdFromShuukhUrl(document.sourceUrl),
        jurisdiction: "MN",
        authority: "SHUUKH",
        sourceType: "judgment",
        originalUrl: document.sourceUrl,
        originalFileName: "shuukh-judgment.html",
        mimeType: document.contentType ?? "text/html",
        encoding: "utf-8",
        fetchedAt: document.fetchedAt.toISOString(),
      });
    } catch (error) {
      console.error("HttpShuukhCrawler: archive store failed", {
        sourceUrl: document.sourceUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
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
    if (done) break;
    if (!value) continue;
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
