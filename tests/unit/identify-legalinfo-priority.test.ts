import { describe, expect, it } from "vitest";

import {
  classifyPriorityLawTitle,
  identifyPriorityLawsFromDocuments,
  priorityLawIdsForIngest,
} from "@/engine/knowledge";

describe("identifyPriorityLawsFromDocuments", () => {
  it("selects unambiguous core statutes without hard-coded lawIds", () => {
    const result = identifyPriorityLawsFromDocuments([
      {
        lawId: "observed-constitution",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=observed-constitution",
        title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ",
      },
      {
        lawId: "observed-criminal",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=observed-criminal",
        title: "Эрүүгийн хууль",
      },
      {
        lawId: "criminal-procedure",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=criminal-procedure",
        title: "Эрүүгийн байцаан шийтгэх хууль",
      },
      {
        lawId: "observed-civil",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=observed-civil",
        title: "Иргэний хууль",
      },
      {
        lawId: "observed-zeh",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=observed-zeh",
        title: "Захиргааны ерөнхий хууль",
      },
      {
        lawId: "observed-zxshx",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=observed-zxshx",
        title: "Захиргааны хэрэг шийдвэрлэх тухай хууль",
      },
      {
        lawId: "reg-1",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=reg-1",
        title: "Эрүүгийн хэрэг бүртгэлтийн журам",
      },
    ]);

    expect(result.ambiguous).toEqual([]);
    expect(priorityLawIdsForIngest(result).sort()).toEqual(
      [
        "observed-constitution",
        "observed-criminal",
        "observed-civil",
        "observed-zeh",
        "observed-zxshx",
        "reg-1",
      ].sort(),
    );
  });

  it("prefers шинэчилсэн найруулга when multiple criminal editions exist", () => {
    const result = identifyPriorityLawsFromDocuments([
      {
        lawId: "a",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=a",
        title: "МОНГОЛ УЛСЫН ЭРҮҮГИЙН ХУУЛЬ",
      },
      {
        lawId: "revised",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=revised",
        title: "ЭРҮҮГИЙН ХУУЛЬ /Шинэчилсэн найруулга/",
      },
      {
        lawId: "b",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=b",
        title: "ЭРҮҮГИЙН ХУУЛЬ",
      },
    ]);
    expect(result.ambiguous).not.toContain("criminal_code");
    expect(priorityLawIdsForIngest(result)).toEqual(["revised"]);
  });

  it("marks ambiguous keys instead of inventing a single lawId", () => {
    const result = identifyPriorityLawsFromDocuments([
      {
        lawId: "a",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=a",
        title: "Эрүүгийн хууль",
      },
      {
        lawId: "b",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=b",
        title: "Монгол Улсын Эрүүгийн хууль",
      },
    ]);
    expect(result.ambiguous).toContain("criminal_code");
    expect(
      priorityLawIdsForIngest(result).some((id) => id === "a" || id === "b"),
    ).toBe(false);
  });

  it("classifies titles for primary keys", () => {
    expect(classifyPriorityLawTitle("Монгол Улсын Үндсэн хууль")).toBe(
      "constitution",
    );
    expect(classifyPriorityLawTitle("Үндсэн хуулийн цэцийн тухай")).toBeNull();
    expect(classifyPriorityLawTitle("Эрүүгийн хууль")).toBe("criminal_code");
    expect(
      classifyPriorityLawTitle(
        "ЭРҮҮГИЙН ХУУЛИЙГ ДАГАЖ МӨРДӨХ ЖУРМЫН ТУХАЙ",
      ),
    ).toBe("related_regulation");
    expect(classifyPriorityLawTitle("Иргэний хууль")).toBe("civil_code");
    expect(classifyPriorityLawTitle("Захиргааны ерөнхий хууль")).toBe(
      "admin_general",
    );
    expect(
      classifyPriorityLawTitle(
        "ЭРҮҮГИЙН ХЭРЭГ ХЯНАН ШИЙДВЭРЛЭХ ТУХАЙ /Шинэчилсэн найруулга/",
      ),
    ).toBe("criminal_procedure");
  });
});
