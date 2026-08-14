import type { IDownloader } from "../../interfaces/downloader.interface";
import type { ISourceConnector } from "../../interfaces/connector.interface";
import { MockSourceConnector } from "../mock-connector";
import { AuthorityType, SourceCountry, SourceFormat } from "../../types";

export function createShuukhConnector(downloader: IDownloader): ISourceConnector {
  return new MockSourceConnector(
    {
      id: "mn.shuukh",
      name: "Shuukh",
      country: SourceCountry.MN,
      authorityType: AuthorityType.COURT,
      supportedFormats: [SourceFormat.HTML, SourceFormat.PDF],
      priority: 20,
      enabled: true,
    },
    downloader,
  );
}
