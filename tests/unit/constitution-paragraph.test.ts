import { describe, expect, it } from "vitest";

import { extractConstitutionParagraph } from "@/engine/knowledge/repository/constitution-paragraph";

describe("extractConstitutionParagraph", () => {
  const articleOne =
    "1.Монгол улс нь бүрэн эрхтэй улс бөгөөд төрийн бүх эрх мэдэл ард түмний мэдэлд байна. 2.Ардчилсан, шударга ёсны нийгэм тогтол, хүний эрх, эрх чөлөө, үндэсний эв нэгдэл, амьдрах аюулгүй байдлыг хангах нь төрийн үүрэг болно.";

  it("extracts the first paragraph from inline constitution article text", () => {
    expect(extractConstitutionParagraph(articleOne, "1")).toBe(
      "Монгол улс нь бүрэн эрхтэй улс бөгөөд төрийн бүх эрх мэдэл ард түмний мэдэлд байна.",
    );
  });

  it("extracts the second paragraph", () => {
    expect(extractConstitutionParagraph(articleOne, "2")).toBe(
      "Ардчилсан, шударга ёсны нийгэм тогтол, хүний эрх, эрх чөлөө, үндэсний эв нэгдэл, амьдрах аюулгүй байдлыг хангах нь төрийн үүрэг болно.",
    );
  });

  it("returns null when the paragraph marker is missing", () => {
    expect(extractConstitutionParagraph("Зөвхөн нэг блок текст.", "2")).toBeNull();
  });
});
