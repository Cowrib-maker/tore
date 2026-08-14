import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  FUTURE_SOURCE_COUNTRIES,
  SourceCountry,
  SourceFormat,
  SourceHealthStatus,
  createSourceFactory,
  createSourceRegistry,
  type DownloadResult,
  type IDownloader,
  type ISourceConnector,
} from "@/engine/data";

describe("SourceFactory and SourceRegistry", () => {
  it("registers replaceable Mongolia connectors in priority order", () => {
    const registry = createSourceFactory().createRegistry();
    const ids = registry.list().map((connector) => connector.id);
    expect(ids).toEqual([
      "mn.legalinfo",
      "mn.parliament",
      "mn.supreme-court",
      "mn.shuukh",
      "mn.prosecutor",
    ]);
    expect(registry.listByCountry(SourceCountry.MN)).toHaveLength(5);
    expect(registry.get("mn.legalinfo")?.authorityType).toBe(
      AuthorityType.LEGISLATION,
    );
    expect(registry.get("mn.shuukh")?.authorityType).toBe(AuthorityType.COURT);
    expect(registry.get("mn.supreme-court")?.authorityType).toBe(
      AuthorityType.SUPREME_COURT,
    );
    expect(registry.get("mn.prosecutor")?.authorityType).toBe(
      AuthorityType.PROSECUTOR,
    );
    expect(registry.get("mn.parliament")?.authorityType).toBe(
      AuthorityType.PARLIAMENT,
    );
  });

  it("reserves future jurisdictions without implementing them", () => {
    const registry = createSourceFactory().createRegistry();
    expect(FUTURE_SOURCE_COUNTRIES).toEqual([
      SourceCountry.KR,
      SourceCountry.JP,
      SourceCountry.CN,
      SourceCountry.SG,
      SourceCountry.KZ,
      SourceCountry.VN,
      SourceCountry.ID,
    ]);
    for (const country of FUTURE_SOURCE_COUNTRIES) {
      expect(registry.listByCountry(country)).toEqual([]);
    }
  });

  it("creates a single connector by id and ignores unknown ids", () => {
    const factory = createSourceFactory();
    expect(factory.create("mn.legalinfo")?.name).toBe("LegalInfo");
    expect(factory.create("kr.moleg")).toBeNull();
    expect(factory.createForCountry(SourceCountry.MN)).toHaveLength(5);
    expect(factory.createForCountry(SourceCountry.KR)).toEqual([]);
  });
});

describe("Mock source connectors", () => {
  it("connects, downloads mock bytes, validates, and transforms without network", async () => {
    const connector = createSourceFactory().create("mn.legalinfo");
    expect(connector).not.toBeNull();
    const source = connector as ISourceConnector;

    const connection = await source.connect();
    expect(connection).toMatchObject({
      sourceId: "mn.legalinfo",
      connected: true,
      mode: "mock",
    });

    const download = await source.download();
    expect(download.origin).toBe("mock");
    expect(download.ok).toBe(true);
    expect(download.bytes.byteLength).toBeGreaterThan(0);
    expect(download.locator).toMatch(/^mock:\/\//);

    const validation = source.validate(download);
    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([]);

    const document = source.transform(download);
    expect(document.sourceId).toBe("mn.legalinfo");
    expect(document.metadata.mock).toBe(true);
    expect(document.metadata.country).toBe(SourceCountry.MN);
    expect(document.text).toContain("Mock LegalInfo statute");

    const health = await source.health();
    expect(health.status).toBe(SourceHealthStatus.HEALTHY);
    expect(health.ok).toBe(true);
  });

  it("rejects payloads that do not belong to the connector", async () => {
    const connector = createSourceFactory().create("mn.shuukh") as ISourceConnector;
    const foreign: DownloadResult = {
      sourceId: "mn.legalinfo",
      ok: true,
      format: SourceFormat.HTML,
      locator: "mock://other",
      bytes: new TextEncoder().encode("<html></html>"),
      contentType: "text/html",
      downloadedAt: new Date().toISOString(),
      origin: "mock",
      error: null,
    };
    expect(connector.validate(foreign)).toEqual({
      ok: false,
      issues: ["source_mismatch"],
    });
  });

  it("accepts an injected downloader", async () => {
    const downloader: IDownloader = {
      async load(request) {
        return {
          sourceId: request.sourceId,
          ok: true,
          format: SourceFormat.JSON,
          locator: "mock://injected",
          bytes: new TextEncoder().encode('{"title":"injected"}'),
          contentType: "application/json",
          downloadedAt: "2026-01-01T00:00:00.000Z",
          origin: "mock",
          error: null,
        };
      },
    };
    const connector = createSourceFactory({ downloader }).create(
      "mn.parliament",
    ) as ISourceConnector;
    const download = await connector.download();
    expect(download.locator).toBe("mock://injected");
    expect(connector.transform(download).text).toBe('{"title":"injected"}');
  });

  it("omits disabled connectors from the enabled list", () => {
    const enabled = createSourceFactory().create("mn.legalinfo") as ISourceConnector;
    const disabled: ISourceConnector = {
      ...enabled,
      id: "mn.legalinfo.disabled",
      enabled: false,
      connect: enabled.connect.bind(enabled),
      download: enabled.download.bind(enabled),
      validate: enabled.validate.bind(enabled),
      transform: enabled.transform.bind(enabled),
      health: enabled.health.bind(enabled),
    };
    const registry = createSourceRegistry([enabled, disabled]);
    expect(registry.listEnabled().map((item) => item.id)).toEqual(["mn.legalinfo"]);
  });
});
