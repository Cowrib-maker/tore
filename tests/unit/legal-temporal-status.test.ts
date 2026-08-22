import { describe, expect, it } from "vitest";

import {
  LegalTemporalEvaluationStatus,
  LegalTemporalRelationType,
  LegalTemporalStatusBasis,
  resolveLegalTemporalStatus,
} from "@/engine/knowledge";

describe("resolveLegalTemporalStatus", () => {
  it("A. preserves a source-supplied validFrom and does not invent validTo", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: "2017-07-01",
      validTo: null,
      asOfDate: "2018-01-01",
    });
    expect(result.validFrom).toBe("2017-07-01");
    expect(result.validTo).toBeNull();
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.SOURCE_DATES);
  });

  it("B. keeps missing validFrom null", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: null,
      validTo: null,
      asOfDate: "2018-01-01",
    });
    expect(result.validFrom).toBeNull();
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA);
  });

  it("C. preserves a source-supplied validTo", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: "2010-01-01",
      validTo: "2020-12-31",
      asOfDate: "2015-06-01",
    });
    expect(result.validTo).toBe("2020-12-31");
    expect(result.validFrom).toBe("2010-01-01");
  });

  it("D. keeps missing validTo null and does not treat that as in force", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: "2017-07-01",
      validTo: null,
      asOfDate: "2020-01-01",
    });
    expect(result.validTo).toBeNull();
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.status).not.toBe(LegalTemporalEvaluationStatus.IN_FORCE);
  });

  it("E. asOfDate before validFrom is UNKNOWN", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: "2017-07-01",
      validTo: null,
      asOfDate: "2015-01-01",
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.SOURCE_DATES);
    expect(result.validFrom).toBe("2017-07-01");
  });

  it("F. asOfDate inside a known validity interval is HISTORICALLY_IN_FORCE", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: "2010-01-01",
      validTo: "2020-12-31",
      asOfDate: "2015-06-15",
    });
    expect(result.status).toBe(
      LegalTemporalEvaluationStatus.HISTORICALLY_IN_FORCE,
    );
    expect(result.basis).toBe(LegalTemporalStatusBasis.HISTORICAL_DATE_RANGE);
  });

  it("G. asOfDate after validTo is UNKNOWN unless expiry is explicit", () => {
    const withoutExpiry = resolveLegalTemporalStatus({
      validFrom: "2010-01-01",
      validTo: "2020-12-31",
      asOfDate: "2021-01-01",
    });
    expect(withoutExpiry.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(withoutExpiry.basis).toBe(LegalTemporalStatusBasis.SOURCE_DATES);

    const withExpiry = resolveLegalTemporalStatus({
      validFrom: "2010-01-01",
      validTo: "2020-12-31",
      asOfDate: "2021-01-01",
      sourceStatus: "EXPIRED",
    });
    expect(withExpiry.status).toBe(LegalTemporalEvaluationStatus.EXPIRED);
    expect(withExpiry.basis).toBe(LegalTemporalStatusBasis.EXPLICIT_EXPIRY);
  });

  it("H. explicit repeal relation covering asOfDate is REPEALED", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "59",
      validFrom: "2002-01-01",
      validTo: null,
      asOfDate: "2018-01-01",
      explicitRelations: [
        {
          relationType: LegalTemporalRelationType.REPEALS,
          fromLawId: "12705",
          toLawId: "59",
          effectiveDate: "2017-07-01",
          sourceLawId: "12705",
          evidence: "caller-supplied repeal relation; not inferred from title",
        },
      ],
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.REPEALED);
    expect(result.basis).toBe(LegalTemporalStatusBasis.EXPLICIT_REPEAL);
    expect(result.validFrom).toBe("2002-01-01");
    expect(result.validTo).toBeNull();
  });

  it("I. explicit supersession relation covering asOfDate ends force of the target", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "112",
      validFrom: "2008-01-01",
      validTo: null,
      asOfDate: "2017-01-01",
      explicitRelations: [
        {
          relationType: LegalTemporalRelationType.SUPERSEDES,
          fromLawId: "11705",
          toLawId: "112",
          effectiveDate: "2016-01-01",
          sourceLawId: "11705",
          evidence: "caller-supplied supersession; not inferred from title",
        },
      ],
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.REPEALED);
    expect(result.basis).toBe(LegalTemporalStatusBasis.EXPLICIT_REPEAL);
  });

  it("does not invent a successor relation from similar titles", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "112",
      validFrom: null,
      validTo: null,
      asOfDate: "2017-01-01",
      title: "БАРИЛГЫН ТУХАЙ",
      explicitRelations: [],
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA);
  });

  it("J. unknown when no dates and no explicit relation", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: null,
      validTo: null,
      asOfDate: "2015-01-01",
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA);
    expect(result.validFrom).toBeNull();
    expect(result.validTo).toBeNull();
  });

  it("K. /Шинэчилсэн найруулга/ alone does not create repeal", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "209",
      validFrom: "2008-01-01",
      validTo: null,
      asOfDate: "2016-01-01",
      title: "ГААЛИЙН ТУХАЙ /Шинэчилсэн найруулга/",
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.status).not.toBe(LegalTemporalEvaluationStatus.REPEALED);
    expect(result.validTo).toBeNull();
  });

  it("L. discovery isactive=1 alone does not create IN_FORCE", () => {
    const result = resolveLegalTemporalStatus({
      validFrom: null,
      validTo: null,
      asOfDate: "2026-08-23",
      discoveryIsActive: true,
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA);
    expect(result.status).not.toBe(LegalTemporalEvaluationStatus.IN_FORCE);
  });

  it("M. 11634 has the same evidence rules as any other instrument", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "11634",
      validFrom: "2017-07-01",
      validTo: null,
      asOfDate: "2026-08-23",
      title: "ЭРҮҮГИЙН ХУУЛЬ /Шинэчилсэн найруулга/",
      discoveryIsActive: true,
      articleNumbers: ["17.1", "17.2"],
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    const withExplicitForce = resolveLegalTemporalStatus({
      lawId: "11634",
      validFrom: "2017-07-01",
      validTo: null,
      asOfDate: "2026-08-23",
      sourceStatus: "IN_FORCE",
    });
    const genericInstrument = resolveLegalTemporalStatus({
      lawId: "310",
      validFrom: "2017-07-01",
      validTo: null,
      asOfDate: "2026-08-23",
      sourceStatus: "IN_FORCE",
    });
    expect(withExplicitForce.status).toBe(LegalTemporalEvaluationStatus.IN_FORCE);
    expect(genericInstrument.status).toBe(withExplicitForce.status);
    expect(result.validFrom).toBe("2017-07-01");
    expect(result.validTo).toBeNull();
  });

  it("N. never invents dates", () => {
    const missing = resolveLegalTemporalStatus({
      validFrom: null,
      validTo: null,
      asOfDate: "2015-01-01",
      title: "ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ",
      discoveryIsActive: true,
    });
    expect(missing.validFrom).toBeNull();
    expect(missing.validTo).toBeNull();
    expect(missing.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);

    const fromOnly = resolveLegalTemporalStatus({
      validFrom: "2017-07-01",
      validTo: null,
      asOfDate: "2018-01-01",
    });
    expect(fromOnly.validFrom).toBe("2017-07-01");
    expect(fromOnly.validTo).toBeNull();
  });

  it("S. 11634 has no special production behavior", () => {
    const generic = resolveLegalTemporalStatus({
      lawId: "310",
      validFrom: "2011-10-06",
      validTo: null,
      asOfDate: "2021-05-10",
    });
    const fixture = resolveLegalTemporalStatus({
      lawId: "11634",
      validFrom: "2011-10-06",
      validTo: null,
      asOfDate: "2021-05-10",
    });
    expect(generic.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(fixture.status).toBe(generic.status);
    expect(fixture.basis).toBe(generic.basis);
  });

  it("explicit IN_FORCE plus started open-ended validity is IN_FORCE", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "367",
      validFrom: "1992-02-12",
      validTo: null,
      asOfDate: "2026-08-23",
      sourceStatus: "IN_FORCE",
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.IN_FORCE);
    expect(result.basis).toBe(LegalTemporalStatusBasis.SOURCE_DATES);
  });

  it("does not apply a repeal before its effectiveDate", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "59",
      validFrom: "2002-01-01",
      validTo: null,
      asOfDate: "2016-01-01",
      explicitRelations: [
        {
          relationType: LegalTemporalRelationType.REPEALS,
          fromLawId: "12705",
          toLawId: "59",
          effectiveDate: "2017-07-01",
          sourceLawId: "12705",
          evidence: "repeal not yet in force on asOfDate",
        },
      ],
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).not.toBe(LegalTemporalStatusBasis.EXPLICIT_REPEAL);
  });

  it("AMENDS does not end force and does not invent a target", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "299",
      validFrom: "2002-01-01",
      validTo: null,
      asOfDate: "2018-01-01",
      explicitRelations: [
        {
          relationType: LegalTemporalRelationType.AMENDS,
          fromLawId: "amendment-1",
          toLawId: "299",
          effectiveDate: "2015-01-01",
          sourceLawId: "amendment-1",
          evidence: "amendment is not repeal",
        },
      ],
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.status).not.toBe(LegalTemporalEvaluationStatus.REPEALED);
  });

  it("repeal-act title does not invent a target lawId", () => {
    const result = resolveLegalTemporalStatus({
      lawId: "12705",
      validFrom: null,
      validTo: null,
      asOfDate: "2018-01-01",
      title: "ЭРҮҮГИЙН БАЙЦААН ШИЙТГЭХ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ",
    });
    expect(result.status).toBe(LegalTemporalEvaluationStatus.UNKNOWN);
    expect(result.basis).toBe(LegalTemporalStatusBasis.INSUFFICIENT_SOURCE_DATA);
    expect(result.validFrom).toBeNull();
    expect(result.validTo).toBeNull();
  });
});
