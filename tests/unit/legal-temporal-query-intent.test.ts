import { describe, expect, it } from "vitest";

import {
  LegalTemporalQueryKind,
  LegalTemporalQueryPrecision,
  parseLegalTemporalQueryIntent,
  stripLegalTemporalQueryPhrases,
} from "@/engine/knowledge";

describe("parseLegalTemporalQueryIntent", () => {
  it("E. parses a full Mongolian calendar date", () => {
    const intent = parseLegalTemporalQueryIntent(
      "2021 оны 5 сарын 10-нд Иргэний хуулийн 1 дүгээр зүйл юу гэж заасан бэ?",
    );
    expect(intent.kind).toBe(LegalTemporalQueryKind.HISTORICAL);
    expect(intent.precision).toBe(LegalTemporalQueryPrecision.DAY);
    expect(intent.asOfDate).toBe("2021-05-10");
    expect(intent.yearRange).toBeNull();
  });

  it("parses дугаар сарын wording without inventing fields", () => {
    const intent = parseLegalTemporalQueryIntent(
      "2021 оны 5 дугаар сарын 10-нд Компанийн хуулийн 15 дугаар зүйл",
    );
    expect(intent.asOfDate).toBe("2021-05-10");
    expect(intent.kind).toBe(LegalTemporalQueryKind.HISTORICAL);
  });

  it("F. parses ISO and dotted calendar dates", () => {
    expect(parseLegalTemporalQueryIntent("2021.05.10 Иргэний хуулийн 1").asOfDate).toBe(
      "2021-05-10",
    );
    expect(parseLegalTemporalQueryIntent("2021-05-10 Иргэний хуулийн 1").asOfDate).toBe(
      "2021-05-10",
    );
  });

  it("G. 2021 онд does not invent a day", () => {
    const intent = parseLegalTemporalQueryIntent(
      "2021 онд Иргэний хуулийн 1 дүгээр зүйл ямар байсан бэ?",
    );
    expect(intent.kind).toBe(LegalTemporalQueryKind.HISTORICAL);
    expect(intent.precision).toBe(LegalTemporalQueryPrecision.YEAR);
    expect(intent.asOfDate).toBeNull();
    expect(intent.yearRange).toEqual({ from: "2021-01-01", to: "2021-12-31" });
    expect(intent.year).toBe(2021);
  });

  it("parses 2021 оны үед as a year-level query", () => {
    const intent = parseLegalTemporalQueryIntent("2021 оны үед Хөдөлмөрийн хуулийн 1");
    expect(intent.asOfDate).toBeNull();
    expect(intent.precision).toBe(LegalTemporalQueryPrecision.YEAR);
    expect(intent.yearRange?.from).toBe("2021-01-01");
  });

  it("H. одоогийн is current intent, not a guessed date", () => {
    const intent = parseLegalTemporalQueryIntent(
      "Одоогийн Иргэний хуулийн 1 дүгээр зүйл юу гэж заасан бэ?",
    );
    expect(intent.kind).toBe(LegalTemporalQueryKind.CURRENT);
    expect(intent.asOfDate).toBeNull();
    expect(intent.precision).toBe(LegalTemporalQueryPrecision.CURRENT);
  });

  it("treats одоо as current intent", () => {
    expect(
      parseLegalTemporalQueryIntent("Одоо Иргэний хуулийн 1 дүгээр зүйл").kind,
    ).toBe(LegalTemporalQueryKind.CURRENT);
  });

  it("тухайн үед without a year is historical but not an invented date", () => {
    const intent = parseLegalTemporalQueryIntent(
      "Тухайн үед Иргэний хуулийн 1 дүгээр зүйл ямар байсан бэ?",
    );
    expect(intent.kind).toBe(LegalTemporalQueryKind.HISTORICAL);
    expect(intent.asOfDate).toBeNull();
    expect(intent.precision).toBe(LegalTemporalQueryPrecision.NONE);
    expect(intent.yearRange).toBeNull();
  });

  it("leaves a question with no temporal qualifier unspecified", () => {
    const intent = parseLegalTemporalQueryIntent(
      "Иргэний хуулийн 1 дүгээр зүйл юу гэж заасан бэ?",
    );
    expect(intent.kind).toBe(LegalTemporalQueryKind.UNSPECIFIED);
    expect(intent.asOfDate).toBeNull();
  });

  it("strips temporal phrases without inventing a remaining date", () => {
    expect(
      stripLegalTemporalQueryPhrases(
        "2021 оны 5 сарын 10-нд Иргэний хуулийн 1 дүгээр зүйл",
      ),
    ).toBe("Иргэний хуулийн 1 дүгээр зүйл");
    expect(
      stripLegalTemporalQueryPhrases("Одоогийн Компанийн хуулийн 15 дугаар зүйл"),
    ).toBe("Компанийн хуулийн 15 дугаар зүйл");
  });
});
