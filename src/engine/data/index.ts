/**
 * TORE Legal Source Connector architecture.
 *
 * Production-ready ports for official sources. Mock-only: no crawl,
 * scrape, HTTP, parser, graph, or database.
 */

export {
  AuthorityType,
  FUTURE_SOURCE_COUNTRIES,
  SourceCountry,
  SourceFormat,
  SourceHealthStatus,
} from "./types";
export type {
  SourceConnection,
  SourceDescriptor,
  SourceDownloadRequest,
  SourceHealth,
  SourceValidationResult,
} from "./types";

export type { ILegalSource } from "./interfaces/source.interface";
export type { ISourceConnector } from "./interfaces/connector.interface";
export type { IDownloader } from "./interfaces/downloader.interface";

export type { SourceDocument } from "./models/source-document";
export type { SourceMetadata } from "./models/source-metadata";
export type { DownloadResult } from "./models/download-result";

export { SourceRegistry, createSourceRegistry } from "./services/source-registry";
export { SourceFactory, createSourceFactory } from "./services/source-factory";
export { MockDownloader } from "./services/mock-downloader";
export { MockSourceConnector } from "./sources/mock-connector";
export {
  createLegalInfoConnector,
  createParliamentConnector,
  createProsecutorConnector,
  createShuukhConnector,
  createSupremeCourtConnector,
} from "./sources";
