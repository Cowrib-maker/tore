import { describe, expect, it } from "vitest";

import { detectExactCitation } from "@/engine/citation";

describe("detectExactCitation", () => {
  it("detects a dotted criminal article as art-17.1", () => {
    expect(detectExactCitation("Эрүүгийн хуулийн 17.1 дүгээр зүйл")).toEqual({
      query: "Эрүүгийн хуулийн 17.1",
      titleHint: "Эрүүгийн",
      article: "17.1",
      paragraph: null,
      locator: "art-17.1",
      dottedArticle: true,
      preferredLawIds: ["11634"],
    });
  });

  it("detects a dotted article without зүйл", () => {
    expect(detectExactCitation("Эрүүгийн хуулийн 17.1")).toMatchObject({
      titleHint: "Эрүүгийн",
      article: "17.1",
      paragraph: null,
      locator: "art-17.1",
      dottedArticle: true,
      preferredLawIds: ["11634"],
    });
  });

  it("detects Хөдөлмөрийн тухай хуулийн 43 дугаар зүйл", () => {
    expect(
      detectExactCitation("Хөдөлмөрийн тухай хуулийн 43 дугаар зүйл"),
    ).toMatchObject({
      titleHint: "Хөдөлмөрийн тухай",
      article: "43",
      paragraph: null,
      locator: "art-43",
      preferredLawIds: ["565"],
    });
  });

  it("detects constitution article paragraph pinpoint", () => {
    expect(
      detectExactCitation(
        "Монгол Улсын Үндсэн хуулийн 1 дүгээр зүйлийн 1 дэх хэсэг юу вэ?",
      ),
    ).toMatchObject({
      titleHint: "Монгол Улсын Үндсэн",
      article: "1",
      paragraph: "1",
      locator: "art-1/p-1",
      preferredLawIds: ["367"],
    });
  });

  it("does not treat weather or general legal questions as exact citations", () => {
    expect(detectExactCitation("Улаанбаатарын цаг агаар ямар вэ?")).toBeNull();
    expect(
      detectExactCitation("Ажлаас үндэслэлгүй халагдсан бол яах вэ?"),
    ).toBeNull();
    expect(detectExactCitation("17.1 дүгээр зүйл")).toBeNull();
  });

  it("keeps 17 and 17.1 as distinct printed locators", () => {
    expect(detectExactCitation("Эрүүгийн хуулийн 17 дугаар зүйл")).toMatchObject({
      article: "17",
      paragraph: null,
      locator: "art-17",
    });
    expect(detectExactCitation("Эрүүгийн хуулийн 17.1 дүгээр зүйл")).toMatchObject({
      article: "17.1",
      paragraph: null,
      locator: "art-17.1",
    });
  });

  it("still detects a citation after a historical date prefix", () => {
    expect(
      detectExactCitation(
        "2021 оны 5 сарын 10-нд Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?",
      ),
    ).toMatchObject({
      titleHint: "Эрүүгийн",
      article: "17.1",
      paragraph: null,
    });
  });

  it("detects citation when question and query are concatenated", () => {
    const once = "Эрүүгийн хуулийн 17.1 дүгээр зүйл";
    expect(detectExactCitation(`${once} ${once}`)).toMatchObject({
      article: "17.1",
      preferredLawIds: ["11634"],
    });
  });
});
