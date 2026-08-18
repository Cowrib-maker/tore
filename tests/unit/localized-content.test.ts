import { describe, expect, it } from "vitest";

import {
  localizedOfferingTitle,
  localizedTaxonomyName,
} from "@/lib/localized-content";

describe("localizedTaxonomyName", () => {
  it("returns the English name for the en locale", () => {
    const name = localizedTaxonomyName(
      { nameEn: "Family Law", nameMn: "Гэр бүлийн эрх зүй" },
      "en",
    );
    expect(name).toBe("Family Law");
  });

  it("falls back to the Mongolian name when English is missing", () => {
    const name = localizedTaxonomyName(
      { nameEn: "", nameMn: "Гэр бүлийн эрх зүй" },
      "en",
    );
    expect(name).toBe("Гэр бүлийн эрх зүй");
  });

  it("returns the Mongolian name for non-en locales", () => {
    const name = localizedTaxonomyName(
      { nameEn: "Family Law", nameMn: "Гэр бүлийн эрх зүй" },
      "mn",
    );
    expect(name).toBe("Гэр бүлийн эрх зүй");
  });
});

describe("localizedOfferingTitle", () => {
  it("returns the English title for the en locale", () => {
    const title = localizedOfferingTitle(
      { titleEn: "Contract Review", titleMn: "Гэрээний хяналт" },
      "en",
    );
    expect(title).toBe("Contract Review");
  });

  it("falls back to the Mongolian title when English is null", () => {
    const title = localizedOfferingTitle(
      { titleEn: null, titleMn: "Гэрээний хяналт" },
      "en",
    );
    expect(title).toBe("Гэрээний хяналт");
  });

  it("returns an empty string when both titles are missing for non-en locales", () => {
    const title = localizedOfferingTitle({ titleEn: null, titleMn: "" }, "mn");
    expect(title).toBe("");
  });
});
