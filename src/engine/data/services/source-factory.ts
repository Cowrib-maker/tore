import type { IDownloader } from "../interfaces/downloader.interface";
import type { ISourceConnector } from "../interfaces/connector.interface";
import {
  createLegalInfoConnector,
  createParliamentConnector,
  createProsecutorConnector,
  createShuukhConnector,
  createSupremeCourtConnector,
} from "../sources";
import type { SourceCountry } from "../types";
import { MockDownloader } from "./mock-downloader";
import { SourceRegistry, createSourceRegistry } from "./source-registry";

export type SourceFactoryDependencies = {
  downloader: IDownloader;
};

/**
 * Builds connectors through DI. Swap {@link IDownloader} or register
 * additional country connectors without changing callers.
 */
export class SourceFactory {
  constructor(private readonly downloader: IDownloader) {}

  createDefaults(): ISourceConnector[] {
    return [
      createLegalInfoConnector(this.downloader),
      createParliamentConnector(this.downloader),
      createSupremeCourtConnector(this.downloader),
      createShuukhConnector(this.downloader),
      createProsecutorConnector(this.downloader),
    ];
  }

  create(id: string): ISourceConnector | null {
    return this.createDefaults().find((connector) => connector.id === id) ?? null;
  }

  createForCountry(country: SourceCountry): ISourceConnector[] {
    return this.createDefaults().filter((connector) => connector.country === country);
  }

  createRegistry(): SourceRegistry {
    return createSourceRegistry(this.createDefaults());
  }
}

export function createSourceFactory(
  overrides: Partial<SourceFactoryDependencies> = {},
): SourceFactory {
  return new SourceFactory(overrides.downloader ?? new MockDownloader());
}
