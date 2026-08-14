import type { IDownloader } from "../../interfaces/downloader.interface";
import type { ISourceConnector } from "../../interfaces/connector.interface";
import { MockSourceConnector } from "../mock-connector";
import { AuthorityType, SourceCountry, SourceFormat } from "../../types";

export function createLegalInfoConnector(
  downloader: IDownloader,
): ISourceConnector {
  return new MockSourceConnector(
    {
      id: "mn.legalinfo",
      name: "LegalInfo",
      country: SourceCountry.MN,
      authorityType: AuthorityType.LEGISLATION,
      supportedFormats: [SourceFormat.HTML, SourceFormat.PDF],
      priority: 10,
      enabled: true,
    },
    downloader,
  );
}
