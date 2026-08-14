import type { IDownloader } from "../../interfaces/downloader.interface";
import type { ISourceConnector } from "../../interfaces/connector.interface";
import { MockSourceConnector } from "../mock-connector";
import { AuthorityType, SourceCountry, SourceFormat } from "../../types";

export function createSupremeCourtConnector(
  downloader: IDownloader,
): ISourceConnector {
  return new MockSourceConnector(
    {
      id: "mn.supreme-court",
      name: "Supreme Court",
      country: SourceCountry.MN,
      authorityType: AuthorityType.SUPREME_COURT,
      supportedFormats: [SourceFormat.HTML, SourceFormat.PDF],
      priority: 15,
      enabled: true,
    },
    downloader,
  );
}
