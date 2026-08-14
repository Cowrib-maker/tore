import type { SourceFormat } from "../types";

export type DownloadResult = {
  sourceId: string;
  ok: boolean;
  format: SourceFormat;
  locator: string;
  bytes: Uint8Array;
  contentType: string;
  downloadedAt: string;
  /** Always `mock` in this architecture; live fetch is not implemented. */
  origin: "mock";
  error: string | null;
};
