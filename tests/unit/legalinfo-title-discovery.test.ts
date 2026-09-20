import { describe, expect, it, vi } from "vitest";

import {
  canonicalLawTitlesMatch,
  discoverLegalInfoLawByTitle,
} from "@/infrastructure/legal-web-research/legalinfo-title-discovery";

function listItem(lawId: string, title: string): string {
  return `<a href="https://legalinfo.mn/mn/detail?lawId=${lawId}" class="act-name fw-500">${title}</a>`;
}

function jsonResponse(html: string, totalPages = 1): Response {
  const pagination =
    totalPages > 1
      ? Array.from({ length: totalPages }, (_, i) => `ajaxPage(${i + 1})`).join(" ")
      : "";
  return new Response(JSON.stringify({ Html: html + pagination }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("canonicalLawTitlesMatch", () => {
  it("matches across the genitive-case citation form vs the nominative official title", () => {
    expect(
      canonicalLawTitlesMatch("ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ", "Захиргааны ерөнхий хуулийн"),
    ).toBe(true);
  });

  it("matches a title carrying a cosmetic revision-edition annotation", () => {
    expect(
      canonicalLawTitlesMatch("ТӨРИЙН АЛБАНЫ ТУХАЙ /Шинэчилсэн найруулга/", "Төрийн албаны тухай"),
    ).toBe(true);
  });

  it("does not match an unrelated law", () => {
    expect(canonicalLawTitlesMatch("ИРГЭНИЙ ХУУЛЬ", "Захиргааны ерөнхий хуулийн")).toBe(false);
  });

  it("does not match a law's own enactment-procedure satellite act (real ambiguous case, req #1)", () => {
    expect(
      canonicalLawTitlesMatch(
        "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛИЙГ ДАГАЖ МӨРДӨХ ЖУРМЫН ТУХАЙ",
        "Төрийн албаны тухай",
      ),
    ).toBe(false);
  });

  it("does not match a law's own repeal-declaration satellite act", () => {
    expect(
      canonicalLawTitlesMatch(
        "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ",
        "Төрийн албаны тухай",
      ),
    ).toBe(false);
  });

  it("does not match a law's own amendment/postponement satellite act", () => {
    expect(
      canonicalLawTitlesMatch(
        "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛИЙН ЗАРИМ ЗААЛТЫН ҮЙЛЧЛЭХ ХУГАЦААГ ХОЙШЛУУЛАХ ТУХАЙ",
        "Төрийн албаны тухай",
      ),
    ).toBe(false);
  });
});

describe("discoverLegalInfoLawByTitle", () => {
  it("finds the matching law within the letter-filtered pages", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      expect(body.get("useg")).toBe("З");
      const page = body.get("page");
      if (page === "1") {
        return jsonResponse(
          listItem("100", "ЗАСГИЙН ГАЗРЫН ТУХАЙ") + listItem("200", "ЗАМ ТЭЭВРИЙН ТУХАЙ"),
          2,
        );
      }
      return jsonResponse(listItem("11259", "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ"), 2);
    });

    const result = await discoverLegalInfoLawByTitle("Захиргааны ерөнхий хуулийн", {
      fetchImpl,
      maxPages: 4,
    });
    expect(result).toEqual({
      kind: "found",
      law: {
        lawId: "11259",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=11259",
        title: "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ",
      },
    });
  });

  it("resolves 'Төрийн албаны тухай хууль' to lawId 13025, never the wrong satellite act 488 (real ambiguous case, req #1 regression)", async () => {
    // Real data captured live from legalinfo.mn category 27, letter "Т":
    // five laws share the leading words "ТӨРИЙН АЛБАНЫ", only one of
    // which — lawId 13025 — is the actual Public Service Law itself.
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        [
          listItem("488", "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛИЙГ ДАГАЖ МӨРДӨХ ЖУРМЫН ТУХАЙ"),
          listItem(
            "489",
            "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛИЙН ЗАРИМ ЗААЛТЫГ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ ХУУЛИЙГ ДАГАЖ МӨРДӨХ ЖУРМЫН ТУХАЙ",
          ),
          listItem(
            "490",
            "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛИЙН ЗАРИМ ЗААЛТЫН ҮЙЛЧЛЭХ ХУГАЦААГ ХОЙШЛУУЛАХ ТУХАЙ",
          ),
          listItem("13050", "ТӨРИЙН АЛБАНЫ ТУХАЙ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ"),
          listItem("13025", "ТӨРИЙН АЛБАНЫ ТУХАЙ /Шинэчилсэн найруулга/"),
        ].join(""),
      ),
    );

    const result = await discoverLegalInfoLawByTitle("Төрийн албаны тухай", { fetchImpl });
    expect(result).toEqual({
      kind: "found",
      law: {
        lawId: "13025",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=13025",
        title: "ТӨРИЙН АЛБАНЫ ТУХАЙ /Шинэчилсэн найруулга/",
      },
    });
  });

  it("returns ambiguous (never guesses) when two candidates are both canonically exact matches", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        listItem("11259", "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ") +
          listItem("99999", "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ /Хуучин хувилбар/"),
      ),
    );
    const result = await discoverLegalInfoLawByTitle("Захиргааны ерөнхий хуулийн", { fetchImpl });
    expect(result.kind).toBe("ambiguous");
    if (result.kind !== "ambiguous") return;
    expect(result.candidates.map((c) => c.lawId).sort()).toEqual(["11259", "99999"]);
  });

  it("returns not_found when nothing matches within maxPages — never guesses", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listItem("999", "ЗАСГИЙН ГАЗРЫН ТУХАЙ"), 2));
    const result = await discoverLegalInfoLawByTitle("Захиргааны ерөнхий хуулийн", {
      fetchImpl,
      maxPages: 2,
    });
    expect(result).toEqual({ kind: "not_found" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns not_found (never throws) on a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await discoverLegalInfoLawByTitle("Захиргааны ерөнхий хуулийн", { fetchImpl });
    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns not_found for a title hint with no usable leading letter", async () => {
    const fetchImpl = vi.fn();
    const result = await discoverLegalInfoLawByTitle("123", { fetchImpl });
    expect(result).toEqual({ kind: "not_found" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("only ever calls the official legalinfo.mn ajaxList endpoint", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://legalinfo.mn/mn/ajaxList/");
      return jsonResponse(listItem("11259", "ЗАХИРГААНЫ ЕРӨНХИЙ ХУУЛЬ"));
    });
    await discoverLegalInfoLawByTitle("Захиргааны ерөнхий хуулийн", { fetchImpl, maxPages: 1 });
    expect(fetchImpl).toHaveBeenCalled();
  });
});
