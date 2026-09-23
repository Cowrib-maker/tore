import { describe, expect, it } from "vitest";

import { classifyEntryIntoForceClause } from "@/engine/knowledge/temporal/classify-entry-into-force-clause";
import { resolveRepealEffectiveDate } from "@/engine/knowledge/temporal/resolve-repeal-effective-date";

describe("resolveRepealEffectiveDate — real 9406 / 563 case", () => {
  const clause = classifyEntryIntoForceClause(
    "2 дугаар зүйл.Энэ хуулийг Хөдөлмөр эрхлэлтийг дэмжих тухай /Шинэчилсэн найруулга/ хууль хүчин төгөлдөр болсон өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Д.ДЭМБЭРЭЛ",
  );

  it("classifies as CROSS_DOCUMENT_REFERENCE (sanity check on the fixture)", () => {
    expect(clause.kind).toBe("CROSS_DOCUMENT_REFERENCE");
  });

  it("RESOLVED: real law 563's own effective date (2013-01-01) is found, so 9406's effective date is deterministically the same", () => {
    const result = resolveRepealEffectiveDate(clause, { found: true, effectiveFrom: "2013-01-01" });
    expect(result).toEqual({
      status: "RESOLVED",
      effectiveDate: "2013-01-01",
      referencedLawText: "Хөдөлмөр эрхлэлтийг дэмжих тухай /Шинэчилсэн найруулга/ хууль",
    });
  });

  it("TARGET_UNRESOLVED: the referenced law was never matched in the corpus", () => {
    const result = resolveRepealEffectiveDate(clause, { found: false });
    expect(result.status).toBe("TARGET_UNRESOLVED");
  });

  it("TARGET_DATE_UNKNOWN: the referenced law was matched, but ITS OWN effective date is unknown — never guesses further", () => {
    const result = resolveRepealEffectiveDate(clause, { found: true, effectiveFrom: null });
    expect(result.status).toBe("TARGET_DATE_UNKNOWN");
  });

  it("NOT_APPLICABLE for a FIXED_DATE clause — this resolver only handles cross-document deferral", () => {
    const fixedDateClause = classifyEntryIntoForceClause(
      "2 дугаар зүйл.Энэ хуулийг 2004 оны 1 дүгээр сарын 1-ний өдрөөс эхлэн дагаж мөрдөнө.",
    );
    const result = resolveRepealEffectiveDate(fixedDateClause, { found: true, effectiveFrom: "1999-01-01" });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("NOT_APPLICABLE for a SELF_ADOPTION_DATE clause", () => {
    const selfAdoption = classifyEntryIntoForceClause("Энэ хууль батлагдсан өдрөөс хүчин төгөлдөр болно.");
    const result = resolveRepealEffectiveDate(selfAdoption, { found: true, effectiveFrom: "1999-01-01" });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("NOT_APPLICABLE for UNRECOGNIZED evidence", () => {
    const result = resolveRepealEffectiveDate({ kind: "UNRECOGNIZED", evidenceText: null }, { found: false });
    expect(result.status).toBe("NOT_APPLICABLE");
  });
});
