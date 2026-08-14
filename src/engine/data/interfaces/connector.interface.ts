import type {
  SourceConnection,
  SourceDownloadRequest,
  SourceHealth,
  SourceValidationResult,
} from "../types";
import type { DownloadResult } from "../models/download-result";
import type { SourceDocument } from "../models/source-document";
import type { ILegalSource } from "./source.interface";

/**
 * Replaceable official-source connector.
 * Implementations must not scrape or call websites in this architecture layer.
 */
export interface ISourceConnector extends ILegalSource {
  connect(): Promise<SourceConnection>;
  download(request?: SourceDownloadRequest): Promise<DownloadResult>;
  validate(result: DownloadResult): SourceValidationResult;
  transform(result: DownloadResult): SourceDocument;
  health(): Promise<SourceHealth>;
}
