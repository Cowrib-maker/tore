/**
 * Country-agnostic contracts for TORE legal source connectors.
 * No network I/O lives in this module.
 */

export const SourceCountry = {
  MN: "MN",
  KR: "KR",
  JP: "JP",
  CN: "CN",
  SG: "SG",
  KZ: "KZ",
  VN: "VN",
  ID: "ID",
} as const;

export type SourceCountry = (typeof SourceCountry)[keyof typeof SourceCountry];

/** Jurisdictions reserved for future connectors. */
export const FUTURE_SOURCE_COUNTRIES: readonly SourceCountry[] = [
  SourceCountry.KR,
  SourceCountry.JP,
  SourceCountry.CN,
  SourceCountry.SG,
  SourceCountry.KZ,
  SourceCountry.VN,
  SourceCountry.ID,
];

export const AuthorityType = {
  LEGISLATION: "LEGISLATION",
  COURT: "COURT",
  SUPREME_COURT: "SUPREME_COURT",
  PROSECUTOR: "PROSECUTOR",
  PARLIAMENT: "PARLIAMENT",
  REGULATION: "REGULATION",
  OTHER: "OTHER",
} as const;

export type AuthorityType = (typeof AuthorityType)[keyof typeof AuthorityType];

export const SourceFormat = {
  HTML: "html",
  PDF: "pdf",
  XML: "xml",
  JSON: "json",
  TEXT: "text",
} as const;

export type SourceFormat = (typeof SourceFormat)[keyof typeof SourceFormat];

export const SourceHealthStatus = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNAVAILABLE: "unavailable",
} as const;

export type SourceHealthStatus =
  (typeof SourceHealthStatus)[keyof typeof SourceHealthStatus];

export type SourceDescriptor = {
  id: string;
  name: string;
  country: SourceCountry;
  authorityType: AuthorityType;
  supportedFormats: readonly SourceFormat[];
  /** Lower values run first. */
  priority: number;
  enabled: boolean;
};

export type SourceConnection = {
  sourceId: string;
  connected: boolean;
  mode: "mock" | "live";
  connectedAt: string;
};

export type SourceDownloadRequest = {
  sourceId: string;
  locator?: string;
  format?: SourceFormat;
};

export type SourceValidationResult = {
  ok: boolean;
  issues: string[];
};

export type SourceHealth = {
  sourceId: string;
  status: SourceHealthStatus;
  ok: boolean;
  checkedAt: string;
  detail: string;
};
