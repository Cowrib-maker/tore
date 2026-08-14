import type { IDownloader } from "../../interfaces/downloader.interface";
import type { ISourceConnector } from "../../interfaces/connector.interface";
import { MockSourceConnector } from "../mock-connector";
import { AuthorityType, SourceCountry, SourceFormat } from "../../types";

export function createParliamentConnector(
  downloader: IDownloader,
): ISourceConnector {
  return new MockSourceConnector(
    {
      id: "mn.parliament",
      name: "Parliament",
      country: SourceCountry.MN,
      authorityType: AuthorityType.PARLIAMENT,
      supportedFormats: [SourceFormat.HTML, SourceFormat.XML],
      priority: 12,
      enabled: true,
    },
    downloader,
  );
}
