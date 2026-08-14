import type { IDownloader } from "../../interfaces/downloader.interface";
import type { ISourceConnector } from "../../interfaces/connector.interface";
import { MockSourceConnector } from "../mock-connector";
import { AuthorityType, SourceCountry, SourceFormat } from "../../types";

export function createProsecutorConnector(
  downloader: IDownloader,
): ISourceConnector {
  return new MockSourceConnector(
    {
      id: "mn.prosecutor",
      name: "Prosecutor",
      country: SourceCountry.MN,
      authorityType: AuthorityType.PROSECUTOR,
      supportedFormats: [SourceFormat.HTML, SourceFormat.PDF],
      priority: 25,
      enabled: true,
    },
    downloader,
  );
}
