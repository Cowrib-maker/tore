import type { IDownloader } from "../interfaces/downloader.interface";
import type { DownloadResult } from "../models/download-result";
import { SourceFormat, type SourceDownloadRequest } from "../types";

const MOCK_PAYLOADS: Record<string, string> = {
  "mn.legalinfo": "<html><title>Mock LegalInfo statute</title></html>",
  "mn.shuukh": "<html><title>Mock Shuukh judgment</title></html>",
  "mn.supreme-court": "<html><title>Mock Supreme Court resolution</title></html>",
  "mn.prosecutor": "<html><title>Mock prosecutor guideline</title></html>",
  "mn.parliament": "<html><title>Mock parliamentary act</title></html>",
};

/**
 * In-memory downloader. Does not open sockets or URLs.
 */
export class MockDownloader implements IDownloader {
  async load(request: SourceDownloadRequest): Promise<DownloadResult> {
    const body =
      MOCK_PAYLOADS[request.sourceId] ??
      `<html><title>Mock document for ${request.sourceId}</title></html>`;
    const bytes = new TextEncoder().encode(body);
    return {
      sourceId: request.sourceId,
      ok: true,
      format: request.format ?? SourceFormat.HTML,
      locator: request.locator ?? `mock://${request.sourceId}`,
      bytes,
      contentType: "text/html; charset=utf-8",
      downloadedAt: new Date().toISOString(),
      origin: "mock",
      error: null,
    };
  }
}
