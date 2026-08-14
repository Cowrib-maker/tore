import type { IDownloader } from "../interfaces/downloader.interface";
import type { ISourceConnector } from "../interfaces/connector.interface";
import type { DownloadResult } from "../models/download-result";
import type { SourceDocument } from "../models/source-document";
import {
  SourceHealthStatus,
  type SourceConnection,
  type SourceDescriptor,
  type SourceDownloadRequest,
  type SourceHealth,
  type SourceValidationResult,
} from "../types";

/**
 * Shared mock connector. No HTTP, filesystem crawl, or parser.
 */
export class MockSourceConnector implements ISourceConnector {
  readonly id: string;
  readonly name: string;
  readonly country: SourceDescriptor["country"];
  readonly authorityType: SourceDescriptor["authorityType"];
  readonly supportedFormats: SourceDescriptor["supportedFormats"];
  readonly priority: number;
  readonly enabled: boolean;

  constructor(
    descriptor: SourceDescriptor,
    private readonly downloader: IDownloader,
  ) {
    this.id = descriptor.id;
    this.name = descriptor.name;
    this.country = descriptor.country;
    this.authorityType = descriptor.authorityType;
    this.supportedFormats = descriptor.supportedFormats;
    this.priority = descriptor.priority;
    this.enabled = descriptor.enabled;
  }

  async connect(): Promise<SourceConnection> {
    return {
      sourceId: this.id,
      connected: this.enabled,
      mode: "mock",
      connectedAt: new Date().toISOString(),
    };
  }

  async download(request: SourceDownloadRequest = { sourceId: this.id }): Promise<DownloadResult> {
    return this.downloader.load({
      ...request,
      sourceId: this.id,
      format: request.format ?? this.supportedFormats[0],
    });
  }

  validate(result: DownloadResult): SourceValidationResult {
    const issues: string[] = [];
    if (result.sourceId !== this.id) {
      issues.push("source_mismatch");
    }
    if (result.origin !== "mock") {
      issues.push("unexpected_origin");
    }
    if (!result.ok) {
      issues.push("download_failed");
    }
    if (result.bytes.byteLength === 0) {
      issues.push("empty_payload");
    }
    return { ok: issues.length === 0, issues };
  }

  transform(result: DownloadResult): SourceDocument {
    const text = new TextDecoder().decode(result.bytes);
    return {
      id: `${this.id}:${result.locator}`,
      sourceId: this.id,
      format: result.format,
      locator: result.locator,
      bytes: result.bytes,
      text,
      metadata: {
        title: titleFromHtml(text) ?? this.name,
        country: this.country,
        authorityType: this.authorityType,
        format: result.format,
        officialLocator: result.locator,
        retrievedAt: result.downloadedAt,
        mock: true,
      },
    };
  }

  async health(): Promise<SourceHealth> {
    const connection = await this.connect();
    return {
      sourceId: this.id,
      status: connection.connected
        ? SourceHealthStatus.HEALTHY
        : SourceHealthStatus.UNAVAILABLE,
      ok: connection.connected,
      checkedAt: new Date().toISOString(),
      detail: connection.connected ? "mock_ready" : "disabled",
    };
  }
}

function titleFromHtml(html: string): string | null {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title : null;
}
