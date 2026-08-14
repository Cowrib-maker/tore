import type { AuthorityType, SourceCountry, SourceFormat } from "../types";

export type SourceMetadata = {
  title: string;
  country: SourceCountry;
  authorityType: AuthorityType;
  format: SourceFormat;
  officialLocator: string | null;
  retrievedAt: string;
  mock: boolean;
};
