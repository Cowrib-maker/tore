import { describe, expect, it } from "vitest";

import {
  chapterFromFileName,
  parseCourtDecisionIndex,
  parseCourtDecisionIndexFromPages,
} from "@/application/student-exam/import/court-decision-index-parser";

const FILE = "10-р бүлэг Амьд явах эрхийн эсрэг гэмт хэрэг.pdf";

// Shapes copied from the real tables of contents: wrapped lines, "дугаатай"/"дугаартай", single page and page ranges.
const PAGE_1 = [
  "1",
  "АРАВДУГААР БҮЛЭГ",
  "Улсын дээд шүүхийн тогтоол",
  " Улсын дээд шүүхийн 2025 оны 04 дүгээр сарын 23-ний өдрийн 2025/ХШТ/48 дугаатай",
  "тогтоол. (Гэр бүлийн хүчирхийлэл үйлдэх гэмт хэрэг болон гэр бүлийн хүчирхийлэл",
  "хүндрүүлэх нөхцөл байдалтайгаар үйлдсэн бусад гэмт хэргийн ялгааны талаар)................ 3",
  " Улсын дээд шүүхийн 2025 оны 04 дүгээр сарын 17-ны өдрийн 2024/ХШТ/54 дугаартай",
  "тогтоол. (Хөдөлмөрийн аюулгүй байдал зөрчигдсөний улмаас амь нас хохирсон хэргийн",
  "талаар)....................................................................................................................................... 4-8",
].join("\n");

// The next page starts with the decision itself: it looks like an entry but has no page reference.
const PAGE_2 = [
  "2",
  " Улсын дээд шүүхийн 2025 оны 04 дүгээр сарын 23-ний өдрийн 2025/ХШТ/48 дугаатай",
  "тогтоол. (Гэр бүлийн хүчирхийлэл)",
  "Шүүх хуралдаанаар хэлэлцсэн ...... хэргийн үйл баримт ойролцоогоор 1 ... 2 ... гэж үзэв.",
].join("\n");

describe("court decision index parser", () => {
  it("reads date, case number, topic and page range exactly as the table of contents gives them", () => {
    const entries = parseCourtDecisionIndex(PAGE_1, "CRIMINAL", FILE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      area: "CRIMINAL",
      chapter: 10,
      courtDate: "2025-04-23",
      caseNumber: "2025/ХШТ/48",
      pageFrom: 3,
      pageTo: 3,
      sourceFile: FILE,
    });
    expect(entries[0]!.topic).toBe("Гэр бүлийн хүчирхийлэл үйлдэх гэмт хэрэг болон гэр бүлийн хүчирхийлэл хүндрүүлэх нөхцөл байдалтайгаар үйлдсэн бусад гэмт хэргийн ялгааны талаар");
    expect(entries[1]).toMatchObject({ caseNumber: "2024/ХШТ/54", courtDate: "2025-04-17", pageFrom: 4, pageTo: 8 });
  });

  it("gives every entry a stable, distinct key", () => {
    const a = parseCourtDecisionIndex(PAGE_1, "CRIMINAL", FILE).map((e) => e.sourceKey);
    const b = parseCourtDecisionIndex(PAGE_1, "CRIMINAL", FILE).map((e) => e.sourceKey);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2);
  });

  it("only treats pages that still contain index entries as the table of contents", () => {
    const r = parseCourtDecisionIndexFromPages([PAGE_1, PAGE_2], "CRIMINAL", FILE);
    expect(r.entries).toHaveLength(2);
    expect(r.tocPages).toBe(1);
    expect(r.leaderLines).toBe(2);
  });

  it("reports leader lines that were not parsed as decisions (e.g. explanatory sections) instead of dropping them silently", () => {
    const withExplanation = `${PAGE_1}\nХуулийн тайлбар.\n Хүнийг алах гэмт хэргийн талаар ................ 20-21`;
    const r = parseCourtDecisionIndexFromPages([withExplanation], "CRIMINAL", FILE);
    expect(r.entries).toHaveLength(2);
    expect(r.leaderLines).toBe(3);
  });

  it("does not invent a date when it is impossible", () => {
    const text = " Улсын дээд шүүхийн 2025 оны 13 дугаар сарын 40-ний өдрийн 2025/ХШТ/1 дугаатай тогтоол. (Сэдэв) ........ 5";
    expect(parseCourtDecisionIndex(text, "CRIMINAL", FILE)[0]!.courtDate).toBeNull();
  });

  it("reads the chapter from the file name", () => {
    expect(chapterFromFileName("22-р бүлэг Авлигын эсрэг гэмт хэрэг.pdf")).toBe(22);
    expect(chapterFromFileName("notes.pdf")).toBeNull();
  });
});
