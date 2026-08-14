import type { SourceDownloadRequest } from "../types";
import type { DownloadResult } from "../models/download-result";

/**
 * Byte loader for a connector.
 * Production HTTP/S3 loaders can replace the mock without changing connectors.
 */
export interface IDownloader {
  load(request: SourceDownloadRequest): Promise<DownloadResult>;
}
