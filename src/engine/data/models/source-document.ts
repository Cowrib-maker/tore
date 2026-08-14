import type { SourceFormat } from "../types";
import type { SourceMetadata } from "./source-metadata";

/**
 * Connector output before parsing.
 * Bytes are supplied by a downloader — never fetched here.
 */
export type SourceDocument = {
  id: string;
  sourceId: string;
  format: SourceFormat;
  locator: string;
  bytes: Uint8Array;
  text: string | null;
  metadata: SourceMetadata;
};
