import { describe, expect, it } from "vitest";
import { createSpellEngineV1, lex } from "@/spell-engine";

const kinds = (t: string) => lex(t).filter((x) => x.kind !== "SPACE").map((x) => `${x.kind}:${x.text}`);

describe("tokenizer v2: protected token kinds", () => {
  it("round-trips exactly for every new kind", () => {
    for (const t of ["Б.Болд ирлээ", "утас +976 9911 2233 эсвэл 9911-2233.", "#хууль @tore_mn `npm i` C:\\Users\\bold\\a.docx /usr/local/bin/x", "Ч.Ж.Дорж, Д. Сүхбаатар"]) {
      const tokens = lex(t);
      expect(tokens.map((x) => x.text).join("")).toBe(t);
      for (const x of tokens) expect(t.slice(x.range.start, x.range.end)).toBe(x.text);
    }
  });
  it("name initials are INITIAL tokens; the name after them is never sentence-initial", () => {
    expect(kinds("Б.Болд")).toEqual(["INITIAL:Б", "PUNCT:.", "WORD:Болд"]);
    const t = lex("Д.Сүхбаатар ирлээ. Тэр");
    expect(t.find((x) => x.text === "Сүхбаатар")!.sentenceInitial).toBe(false);
    expect(t.find((x) => x.text === "Тэр")!.sentenceInitial).toBe(true); // a real sentence end still counts
    // a single capital letter that is not an initial stays a normal token
    expect(lex("Би ирлээ")[0]!.kind).toBe("WORD");
  });
  it("phone numbers, hashtags, mentions, paths and code are single protected tokens", () => {
    expect(kinds("+976 9911 2233")).toEqual(["PHONE:+976 9911 2233"]);
    expect(kinds("9911 2233")).toEqual(["PHONE:9911 2233"]);
    expect(kinds("#хууль")).toEqual(["HASHTAG:#хууль"]);
    expect(kinds("@tore_mn")).toEqual(["MENTION:@tore_mn"]);
    expect(kinds("C:\\Users\\bold\\a.docx")).toEqual(["PATH:C:\\Users\\bold\\a.docx"]);
    expect(kinds("`npm i`")).toEqual(["CODE:`npm i`"]);
  });
  it("numbers, dates, decimals and legal references are not mistaken for phones", () => {
    for (const n of ["2026.10.06", "1,234,567.89", "15.5%", "3.1", "12:30"]) expect(kinds(n).every((k) => k.startsWith("NUMBER") || k.startsWith("PUNCT"))).toBe(true);
    expect(kinds("2026.10.06").some((k) => k.startsWith("PHONE"))).toBe(false);
  });
  it("email and URL still win over mention/path", () => {
    expect(kinds("info@tore.mn")).toEqual(["EMAIL:info@tore.mn"]);
    expect(kinds("https://tore.mn/spell?id=42")).toEqual(["URL:https://tore.mn/spell?id=42"]);
  });
  it("the engine never accuses any protected kind", () => {
    const e = createSpellEngineV1();
    for (const t of ["Б.Болд", "+976 9911 2233", "#хууль", "@tore_mn", "C:\\Users\\bold\\a.docx", "`хууль2`", "Ч.Ж.Дорж"]) {
      const r = e.analyze(t, { reportUnknown: true });
      expect(r.issues, t).toEqual([]);
    }
  });
});
