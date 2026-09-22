import { describe, expect, it } from "vitest";

import { extractLegalInfoMetadata } from "@/engine/knowledge/adapters/mongolia/legalinfo/html";

describe("extractLegalInfoMetadata — title selection", () => {
  it("prefers og:title over a translation-notice banner in <h1> (real bug: lawId 223/224)", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="ГОЛ, МӨРНИЙ УРСАЦ БҮРЭЛДЭХ ЭХ, УСНЫ САН БҮХИЙ ГАЗРЫН ХАМГААЛАЛТЫН БҮС, ОЙН САН БҮХИЙ ГАЗАРТ АШИГТ МАЛТМАЛ ХАЙХ, АШИГЛАХЫГ ХОРИГЛОХ ТУХАЙ">
        <title>ГОЛ, МӨРНИЙ УРСАЦ БҮРЭЛДЭХ ЭХ, УСНЫ САН БҮХИЙ ГАЗРЫН ХАМГААЛАЛТЫН БҮС, ОЙН САН БҮХИЙ ГАЗАРТ АШИГТ МАЛТМАЛ ХАЙХ, АШИГЛАХЫГ ХОРИГЛОХ ТУХАЙ</title>
      </head><body>
        <h1>( 2023 .0 6. 29- ний өдрийн орчуулга ) Unofficial translation</h1>
        <h1></h1>
        <h1>LAW OF MONGOLIA</h1>
        <h1>June 16, 2009 Ulaanbaatar city</h1>
        <h1>ON PROHIBITION OF MINERAL EXPLORATION AND MINERAL MINING AT HEADWATERS OF RIVERS</h1>
      </body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.title).toBe(
      "ГОЛ, МӨРНИЙ УРСАЦ БҮРЭЛДЭХ ЭХ, УСНЫ САН БҮХИЙ ГАЗРЫН ХАМГААЛАЛТЫН БҮС, ОЙН САН БҮХИЙ ГАЗАРТ АШИГТ МАЛТМАЛ ХАЙХ, АШИГЛАХЫГ ХОРИГЛОХ ТУХАЙ",
    );
  });

  it("prefers og:title over a per-article <h1> heading (real bug: lawId 344)", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="МОНГОЛ УЛСЫН ЗАСГИЙН ГАЗРЫН ТУХАЙ">
      </head><body>
        <h1>Article 1.Purpose of the Law</h1>
        <h1>Article 2.Legislation on the Government</h1>
      </body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.title).toBe("МОНГОЛ УЛСЫН ЗАСГИЙН ГАЗРЫН ТУХАЙ");
  });

  it("uses <title> when og:title is absent but <title> holds the real title", () => {
    const html = `<html><head><title>ГАЗРЫН ТУХАЙ</title></head><body></body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.title).toBe("ГАЗРЫН ТУХАЙ");
  });

  it("falls back to <h1> when neither og:title nor <title> exists (no regression for pages that never had these tags)", () => {
    const html = `<html><body><h1>ХӨДӨЛМӨР ЭРХЛЭЛТИЙГ ДЭМЖИХ ТУХАЙ</h1></body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.title).toBe("ХӨДӨЛМӨР ЭРХЛЭЛТИЙГ ДЭМЖИХ ТУХАЙ");
  });

  it("still rejects the known generic og:title placeholder and treats it as no title", () => {
    const html = `<html><head><meta property="og:title" content="Монгол улсын хууль"></head><body></body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.title).toBeNull();
  });

  it("matches the real, correctly-parsed case with no <h1> on the page at all (regression: laws 216/367/563/7106)", () => {
    const html = `<html><head><meta property="og:title" content="МОНГОЛ УЛСЫН ЭРҮҮГИЙН ХУУЛЬ"></head><body>no h1 anywhere on this page</body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.title).toBe("МОНГОЛ УЛСЫН ЭРҮҮГИЙН ХУУЛЬ");
  });

  it("returns null when no title signal exists anywhere on the page", () => {
    const meta = extractLegalInfoMetadata("<html><body>no title here</body></html>");
    expect(meta.title).toBeNull();
  });
});
