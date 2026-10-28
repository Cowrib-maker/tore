import { describe, expect, it } from "vitest";

import { candidateLawIdsForDomain } from "@/engine/citation/canonical-law-titles";

describe("candidateLawIdsForDomain", () => {
  it("maps CRIMINAL to the Criminal Code only", () => {
    expect(candidateLawIdsForDomain("CRIMINAL")).toEqual(["11634"]);
  });

  it("maps CIVIL to both the Civil Code and the Labor Law — matching DOMAIN_DOCUMENT_TYPES.CIVIL's LABOR_LAW grouping", () => {
    expect(candidateLawIdsForDomain("CIVIL")).toEqual(["299", "565"]);
  });

  it("is case-insensitive", () => {
    expect(candidateLawIdsForDomain("civil")).toEqual(["299", "565"]);
  });

  it("returns an empty list for ADMINISTRATIVE — no canonical entry yet, never guesses", () => {
    expect(candidateLawIdsForDomain("ADMINISTRATIVE")).toEqual([]);
  });

  it("returns an empty list for null or an unknown domain", () => {
    expect(candidateLawIdsForDomain(null)).toEqual([]);
    expect(candidateLawIdsForDomain("SOMETHING_ELSE")).toEqual([]);
  });
});
