import { describe, expect, it } from "vitest";

import { LegalInfoLawParser } from "@/engine/knowledge";
import {
  LegalDocumentStatus,
  LegalIdentifierScheme,
  LegalNodeKind,
  LegalSourceKind,
} from "@/engine/knowledge/schema";

const FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head>
  <link rel="canonical" href="https://legalinfo.mn/mn/detail?lawId=16230654312051" />
  <script>var lawId = "16230654312051"; function downloadlaw(a,b){}</script>
</head>
<body>
  <h1>МОНГОЛ УЛСЫН ХУУЛЬ</h1>
  <div data-block="enacteddate">2017 оны 5 дугаар сарын 25</div>
  <div data-block="enforcementdate">2017 оны 7 дугаар сарын 01</div>
  <div>Төрийн мэдээлэл эмхэтгэл: 2017 оны 24 дүгээр</div>
  <div class="law-content">
    <p>МОНГОЛ УЛСЫН ХУУЛЬ</p>
    <p>ИРГЭНИЙ ХЭРЭГ ШҮҮХЭД ХЯНАН ШИЙДВЭРЛЭХ ТУХАЙ</p>
    <p>/Шинэчилсэн найруулга/</p>
    <p>I ХЭСЭГ</p>
    <p>НЭГДҮГЭЭР БҮЛЭГ НИЙТЛЭГ ҮНДЭСЛЭЛ</p>
    <p>1 дүгээр зүйл.Хуулийн зорилт</p>
    <p>1.1.Энэ хуулийн зорилт нь иргэний хэргийг шүүхэд хянан шийдвэрлэх журмыг тогтооход оршино.</p>
    <p>1.1.1.Хэргийн харьяалалтай холбоотой харилцааг зохицуулна.</p>
    <p>1.1.1.1.дэлгэрэнгүй журам.</p>
    <p>а)нэхэмжлэгчийн эрх;</p>
    <p>/б/хариуцагчийн үүрэг.</p>
    <p>НЭГДҮГЭЭР ДЭД БҮЛЭГ ХЭРГИЙН ХАРЪЯАЛАЛ</p>
    <p>2 дугаар зүйл.Хэргийн харьяалал</p>
    <p>2.1.Шүүх хэргийг харьяаллын дагуу шийдвэрлэнэ.</p>
    <p>ХОЁРДУГААР БҮЛЭГ ШҮҮХ ХУРАЛДААН</p>
    <p>АРВАН ДОЛДУГААР БҮЛЭГ ШИЙДВЭР</p>
  </div>
</body>
</html>`;

describe("LegalInfoLawParser", () => {
  const parser = new LegalInfoLawParser();

  it("parses identity, official number, and effective date from local HTML", () => {
    const document = parser.parse(FIXTURE_HTML);

    expect(document.identity.id).toBe("legalinfo:law:16230654312051");
    expect(document.identity.title).toBe(
      "ИРГЭНИЙ ХЭРЭГ ШҮҮХЭД ХЯНАН ШИЙДВЭРЛЭХ ТУХАЙ",
    );
    expect(document.identity.jurisdiction).toBe("MN");
    expect(document.identity.language).toBe("mn");
    expect(document.source).toEqual({
      kind: LegalSourceKind.LAW,
      instrumentClass: "STATUTE",
      enactingBody: "Улсын Их Хурал",
    });
    expect(document.publication.documentNumber).toBe("2017 оны 24 дүгээр");
    expect(document.publication.publicationSeries).toBe("2017 оны 24 дүгээр");
    expect(document.publication.issuedOn).toBe("2017-05-25");
    expect(document.temporal.effectiveOn).toBe("2017-07-01");
    expect(document.temporal.validFrom).toBe("2017-07-01");
    expect(document.temporal.validTo).toBeNull();
    expect(document.temporal.status).toBe(LegalDocumentStatus.UNKNOWN);
    expect(document.identity.identifiers).toEqual(
      expect.arrayContaining([
        {
          scheme: LegalIdentifierScheme.LEGALINFO_LAW_ID,
          value: "16230654312051",
        },
        {
          scheme: LegalIdentifierScheme.DOCUMENT_NUMBER,
          value: "2017 оны 24 дүгээр",
        },
      ]),
    );
  });

  it("builds the full Mongolian hierarchy without rewriting wording", () => {
    const document = parser.parse(FIXTURE_HTML);
    const part = document.hierarchy[0];
    expect(part?.kind).toBe(LegalNodeKind.PART);
    expect(part?.text).toBe("I ХЭСЭГ");
    expect(part?.locator).toMatchObject({ display: "I ХЭСЭГ", part: "1" });

    const chapter1 = part?.children[0];
    expect(chapter1?.kind).toBe(LegalNodeKind.CHAPTER);
    expect(chapter1?.text).toBe("НЭГДҮГЭЭР БҮЛЭГ НИЙТЛЭГ ҮНДЭСЛЭЛ");
    expect(chapter1?.heading).toBe("НИЙТЛЭГ ҮНДЭСЛЭЛ");
    expect(chapter1?.locator?.chapter).toBe("1");

    const article1 = chapter1?.children[0];
    expect(article1?.kind).toBe(LegalNodeKind.ARTICLE);
    expect(article1?.text).toBe("1 дүгээр зүйл.Хуулийн зорилт");
    expect(article1?.heading).toBe("Хуулийн зорилт");

    const paragraph = article1?.children[0];
    expect(paragraph?.kind).toBe(LegalNodeKind.PARAGRAPH);
    expect(paragraph?.text).toBe(
      "1.1.Энэ хуулийн зорилт нь иргэний хэргийг шүүхэд хянан шийдвэрлэх журмыг тогтооход оршино.",
    );
    expect(paragraph?.locator).toMatchObject({
      display: "1.1",
      article: "1",
      paragraph: "1",
    });

    const subparagraph = paragraph?.children[0];
    expect(subparagraph?.kind).toBe(LegalNodeKind.SUBPARAGRAPH);
    expect(subparagraph?.text).toBe(
      "1.1.1.Хэргийн харьяалалтай холбоотой харилцааг зохицуулна.",
    );

    const numericItem = subparagraph?.children[0];
    expect(numericItem?.kind).toBe(LegalNodeKind.ITEM);
    expect(numericItem?.text).toBe("1.1.1.1.дэлгэрэнгүй журам.");
    expect(numericItem?.locator?.item).toBe("1");

    expect(subparagraph?.children[1]?.text).toBe("а)нэхэмжлэгчийн эрх;");
    expect(subparagraph?.children[2]?.text).toBe("/б/хариуцагчийн үүрэг.");

    const nestedSection = chapter1?.children[1];
    expect(nestedSection?.kind).toBe(LegalNodeKind.SECTION);
    expect(nestedSection?.text).toBe("НЭГДҮГЭЭР ДЭД БҮЛЭГ ХЭРГИЙН ХАРЪЯАЛАЛ");
    expect(chapter1?.kind).toBe(LegalNodeKind.CHAPTER);

    const article2 = nestedSection?.children[0];
    expect(article2?.kind).toBe(LegalNodeKind.ARTICLE);
    expect(article2?.text).toBe("2 дугаар зүйл.Хэргийн харьяалал");
    expect(article2?.children[0]?.text).toBe(
      "2.1.Шүүх хэргийг харьяаллын дагуу шийдвэрлэнэ.",
    );

    expect(part?.children[1]?.text).toBe("ХОЁРДУГААР БҮЛЭГ ШҮҮХ ХУРАЛДААН");
    expect(part?.children[1]?.locator?.chapter).toBe("2");
    expect(part?.children[2]?.text).toBe("АРВАН ДОЛДУГААР БҮЛЭГ ШИЙДВЭР");
    expect(part?.children[2]?.locator?.chapter).toBe("17");
  });

  it("uses an injected official URL without fetching", () => {
    const document = parser.parse(
      "<p>3 дугаар зүйл.Туршилт</p><p>3.1.Текст.</p>",
      { officialUrl: "https://example.test/law/local" },
    );
    expect(document.identity.title).toBe("3 дугаар зүйл.Туршилт");
    expect(document.publication.officialUrl).toBe(
      "https://example.test/law/local",
    );
    expect(document.hierarchy[0]?.kind).toBe(LegalNodeKind.ARTICLE);
    expect(document.hierarchy[0]?.text).toBe("3 дугаар зүйл.Туршилт");
  });
});
