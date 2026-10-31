import { describe, expect, it } from "vitest";

import { parseProblemDocument } from "@/application/student-exam/import/docx-problem-parser";
import { importParsedProblems } from "@/application/student-exam/import/import-problems";
import { buildImportReport } from "@/application/student-exam/import/import-report";

import { FakeStudentExamRepository } from "./helpers/fake-student-exam-repository";

const long = (s: string) => `${s} ${"Тайлбар ".repeat(60)}`;

/** Synthetic text with the same shapes the real sources use (headings, "Асуулт", "жишиг хариулт" markers, quirks). */
const SOURCE = [
  "ЭРҮҮГИЙН ЭРХ ЗҮЙН БОДЛОГО",
  "",
  "Бодлого-1",
  "",
  "“Ө” нь бусдыг зодож гэмтээсэн. Үйл баримтын эхний догол.",
  "",
  "Хоёр дахь догол мөр, үгчлэн хадгална.",
  "",
  "Асуулт: Гэмт хэргийг зүйлчилнэ үү.",
  "",
  "2. Ял оногдуулна уу.",
  "",
  `Бодлого 1-ийн жишиг хариулт: ${long("Эрүүгийн хуулийн 91 дүгээр зүйл болон Иргэний хуулийн 58.6-р зүйл.")}`,
  "",
  "Бодолтын процесс",
  "",
  "УДШ-ийн тогтоол. Дугаар 23. Эрүүгийн хуулийн 91 дүгээр зүйлийг тайлбарлах тухай. 2003;",
  "",
  "Бодлого-2",
  "",
  "Хоёр дахь бодлогын нөхцөл.",
  "",
  "Шийдвэрлэх асуудал: Шийдвэрлэнэ үү.",
  "",
  "Бодлого 2-ын жишиг хариулт:",
  "",
  "",
  "Бодлого-3",
  "",
  "Асуулт байхгүй, хариултын тэмдэглэгээ байхгүй бодлого.",
  "",
  "Бодлого-4",
  "",
  "Cy6vexmuтал гэх холимог бичигтэй үг; ЭБШ хуулийн 68 дүгээр зүйл.",
  "",
  "Асуулт: Дүгнэнэ үү.",
  "",
  `Бодлого 4-ийн жишиг хариулт: ${long("Хариулт.")}`,
  "",
  "Бодлого-5",
  "",
  "“Ө” нь бусдыг зодож гэмтээсэн. Үйл баримтын эхний догол.",
  "",
  "Хоёр дахь догол мөр, үгчлэн хадгална.",
  "",
  "Асуулт: Өөр асуулт.",
  "",
  `Бодлого 5-ын жишиг хариулт: ${long("Давхардсан нөхцөл.")}`,
  "",
  "Бодлого-4",
  "",
  "Жич: тусдаа тэмдэглэл.",
  "",
  "Бодлого-6",
  "",
  "“Ө” нь бусдыг зодож гэмтээсэн. Үйл баримтын эхний догол.",
  "",
  "Хоёр дахь догол мөр, үгчлэн хадгална.",
  "",
  "Асуулт: Гэмт хэргийг зүйлчилнэ үү.",
  "",
  "2. Ял оногдуулна уу.",
  "",
  `Бодлого 1-ийн жишиг хариулт: ${long("Эрүүгийн хуулийн 91 дүгээр зүйл болон Иргэний хуулийн 58.6-р зүйл.")}`,
  "",
  "Бодолтын процесс",
  "",
  "УДШ-ийн тогтоол. Дугаар 23. Эрүүгийн хуулийн 91 дүгээр зүйлийг тайлбарлах тухай. 2003;",
].join("\n");

const parse = () => parseProblemDocument(SOURCE, "CRIMINAL", "criminal.docx");

describe("DOCX problem parser: structure and fidelity", () => {
  it("finds every problem heading and keeps source order and identifiers", () => {
    const r = parse();
    expect(r.problems.map((p) => p.ordinalLabel)).toEqual(["Бодлого-1", "Бодлого-2", "Бодлого-3", "Бодлого-4", "Бодлого-5", "Бодлого-4"]);
    expect(r.problems.map((p) => p.ordinal)).toEqual([1, 2, 3, 4, 5, 4]);
    expect(r.problems.every((p) => p.sourceFile === "criminal.docx" && p.area === "CRIMINAL")).toBe(true);
  });

  it("copies statement paragraphs verbatim (quotes, spelling, paragraph breaks) and splits questions from the answer", () => {
    const p = parse().problems[0]!;
    expect(p.statement).toBe("“Ө” нь бусдыг зодож гэмтээсэн. Үйл баримтын эхний догол.\n\nХоёр дахь догол мөр, үгчлэн хадгална.");
    expect(p.questions).toEqual(["Асуулт: Гэмт хэргийг зүйлчилнэ үү.", "2. Ял оногдуулна уу."]);
    expect(p.modelAnswer).toContain("Эрүүгийн хуулийн 91 дүгээр зүйл болон Иргэний хуулийн 58.6-р зүйл.");
    expect(p.modelAnswer).not.toContain("жишиг хариулт");
    expect(p.statement).not.toContain("Асуулт");
  });

  it("never lets the model answer leak into the statement or the questions", () => {
    for (const p of parse().problems) {
      if (!p.modelAnswer) continue;
      const answerStart = p.modelAnswer.slice(0, 40);
      expect(p.statement.includes(answerStart)).toBe(false);
      expect(p.questions.join(" ").includes(answerStart)).toBe(false);
    }
  });

  it("records the source location instead of inventing a page", () => {
    const p = parse().problems[0]!;
    expect(p.locator.page).toBeNull();
    expect(p.locator.heading).toBe("Бодлого-1");
    expect(p.locator.paragraphStart).toBeLessThan(p.locator.paragraphEnd);
  });

  it("extracts provisions, court citations and the source's own outline, labelled as pattern-derived", () => {
    const p = parse().problems[0]!;
    expect(p.legalProvisions.map((c) => c.text)).toEqual(
      expect.arrayContaining(["Эрүүгийн хуулийн 91 дүгээр зүйл", "Иргэний хуулийн 58.6-р зүйл"]),
    );
    expect(p.legalProvisions.every((c) => c.origin === "SOURCE_PATTERN")).toBe(true);
    expect(p.courtCitations[0]!.text).toContain("УДШ-ийн тогтоол. Дугаар 23");
    expect(p.answerOutline).toContain("Бодолтын процесс");
  });

  it("matches markers on NFC text but stores the original characters", () => {
    const decomposed = "ШИЙДВЭРЛЭХ АСУУДАЛ".replace("Й", "Й");
    const text = ["Бодлого-1", "Нөхцөл", `${decomposed}: Асуулт?`, `Бодлого 1-ийн жишиг хариулт: ${long("Хариулт")}`].join("\n");
    const p = parseProblemDocument(text, "CIVIL", "c.docx").problems[0]!;
    expect(p.questions[0]).toContain("Й");
    expect(p.flags).not.toContain("NO_QUESTION_MARKER");
  });
});

describe("DOCX problem parser: uncertainty goes to review, never guessed", () => {
  it("flags a missing answer marker / empty answer / missing question and holds the problem back", () => {
    const r = parse();
    const byLabel = Object.fromEntries(r.problems.map((p) => [p.ordinalLabel, p]));
    expect(byLabel["Бодлого-2"]!.flags).toContain("EMPTY_MODEL_ANSWER");
    expect(byLabel["Бодлого-2"]!.modelAnswer).toBeNull();
    expect(byLabel["Бодлого-2"]!.reviewStatus).toBe("NEEDS_REVIEW");
    expect(byLabel["Бодлого-3"]!.flags).toEqual(expect.arrayContaining(["NO_ANSWER_MARKER", "NO_QUESTION_MARKER"]));
    expect(byLabel["Бодлого-3"]!.reviewStatus).toBe("NEEDS_REVIEW");
  });

  it("flags possible OCR noise and possibly outdated law without altering the text", () => {
    const p = parse().problems.find((x) => x.ordinalLabel === "Бодлого-4")!;
    expect(p.flags).toEqual(expect.arrayContaining(["OCR_NOISE_SUSPECTED", "POSSIBLY_OUTDATED_LAW"]));
    expect(p.statement).toContain("Cy6vexmuтал");
    expect(p.statement).toContain("ЭБШ хуулийн 68 дүгээр зүйл");
    expect(p.reviewStatus).toBe("IMPORTED"); // advisory flags alone do not hide a well-formed problem
  });

  it("keeps a stray repeated heading (a note) as its own hidden record instead of dropping its text", () => {
    const r = parse();
    const notes = r.problems.filter((p) => p.ordinal === 4);
    expect(notes).toHaveLength(2);
    const note = notes[1]!;
    expect(note.statement).toBe("Жич: тусдаа тэмдэглэл.");
    expect(note.flags).toEqual(expect.arrayContaining(["DUPLICATE_ORDINAL", "NO_ANSWER_MARKER", "NO_QUESTION_MARKER"]));
    expect(note.reviewStatus).toBe("NEEDS_REVIEW");
    expect(note.modelAnswer).toBeNull();
    expect(note.sourceKey).not.toBe(notes[0]!.sourceKey);
  });

  it("keeps a problem whose statement repeats but whose questions/answer differ, flagged for review", () => {
    const r = parse();
    const five = r.problems.find((p) => p.ordinal === 5)!;
    expect(five.flags).toContain("DUPLICATE_STATEMENT");
    expect(five.reviewStatus).toBe("NEEDS_REVIEW");
    expect(five.modelAnswer).toContain("Давхардсан нөхцөл.");
    expect(five.questions).toEqual(["Асуулт: Өөр асуулт."]);
  });

  it("leaves out ONLY an exact duplicate (same statement, questions and answer) and reports it", () => {
    const r = parse();
    expect(r.skipped).toEqual([expect.objectContaining({ reason: "DUPLICATE_STATEMENT", heading: "Бодлого-6", duplicateOf: 1 })]);
    expect(r.problems.some((p) => p.ordinal === 6)).toBe(false);
  });

  it("accounts for every non-empty source line: nothing is silently discarded", () => {
    const lines = SOURCE.split("\n").map((l) => l.trim()).filter(Boolean);
    const r = parse();
    const text = r.problems.map((p) => [p.statement, ...p.questions, p.modelAnswer ?? ""].join("\n")).join("\n");
    const skippedBlockLines = new Set<string>(); // lines of the exact duplicate; the same lines exist in problem 1
    const missing = lines.filter((l) => {
      if (/^Бодлого[\s-]*\d+$/.test(l) || l === "ЭРҮҮГИЙН ЭРХ ЗҮЙН БОДЛОГО") return false; // title and headings (kept as ordinalLabel)
      const body = l.replace(/^(?:Бодлого[\s-]*\d+[\s-]*(?:ийн|ын)?[\s-]*)?жишиг хариулт:\s*/u, "");
      return !text.includes(body) && !skippedBlockLines.has(l);
    });
    expect(missing).toEqual([]);
  });

  it("gives identical keys and hashes on every parse (stable identity)", () => {
    const a = parse().problems.map((p) => [p.sourceKey, p.contentHash, p.statementHash]);
    const b = parse().problems.map((p) => [p.sourceKey, p.contentHash, p.statementHash]);
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x[0])).size).toBe(a.length);
  });
});

describe("import: idempotency, duplicates, changed sources", () => {
  it("imports once and reports unchanged on a second run (no duplicate rows)", async () => {
    const repo = new FakeStudentExamRepository();
    const problems = parse().problems;
    const first = await importParsedProblems(problems, { studentExamRepository: repo });
    expect(first).toMatchObject({ created: 6, unchanged: 0, duplicate: 0, total: 6 });
    const second = await importParsedProblems(problems, { studentExamRepository: repo });
    expect(second).toMatchObject({ created: 0, unchanged: 6, duplicate: 0 });
    expect(repo.problems.size).toBe(6);
  });

  it("stores the answer key apart from the public problem", async () => {
    const repo = new FakeStudentExamRepository();
    await importParsedProblems(parse().problems, { studentExamRepository: repo });
    const [first] = await repo.listProblems({ statuses: ["IMPORTED", "NEEDS_REVIEW"] });
    expect(Object.keys(first!)).not.toEqual(expect.arrayContaining(["modelAnswer"]));
    expect(JSON.stringify(first)).not.toContain("Эрүүгийн хуулийн 91 дүгээр зүйл болон");
    const [key] = await repo.getKeys([first!.id]);
    expect(key!.modelAnswer).toContain("Эрүүгийн хуулийн 91 дүгээр зүйл болон");
  });

  it("does not overwrite reviewer decisions when the source is unchanged", async () => {
    const repo = new FakeStudentExamRepository();
    const problems = parse().problems;
    await importParsedProblems(problems, { studentExamRepository: repo });
    const id = [...repo.problems.keys()][0]!;
    await repo.setReview(id, { status: "APPROVED", note: "ok", reviewerId: "admin", at: new Date() });
    await importParsedProblems(problems, { studentExamRepository: repo });
    expect(repo.problems.get(id)!.reviewStatus).toBe("APPROVED");
  });

  it("routes a changed source back to review instead of silently overwriting", async () => {
    const repo = new FakeStudentExamRepository();
    const original = parse().problems;
    await importParsedProblems(original, { studentExamRepository: repo });
    const id = [...repo.problems.keys()][0]!;
    await repo.setReview(id, { status: "APPROVED", note: null, reviewerId: "admin", at: new Date() });
    const edited = parseProblemDocument(SOURCE.replace("Үйл баримтын эхний догол.", "Үйл баримтын ӨӨРЧЛӨГДСӨН догол."), "CRIMINAL", "criminal.docx").problems;
    const out = await importParsedProblems(edited, { studentExamRepository: repo });
    expect(out.changed).toBe(1);
    const p = repo.problems.get(id)!;
    expect(p.reviewStatus).toBe("NEEDS_REVIEW");
    expect(p.reviewFlags).toContain("SOURCE_CHANGED");
    expect(p.statement).toContain("ӨӨРЧЛӨГДСӨН");
  });

  it("recognises the same statement imported under another identity as a duplicate", async () => {
    const repo = new FakeStudentExamRepository();
    const [a] = parse().problems;
    await importParsedProblems([a!], { studentExamRepository: repo });
    const out = await importParsedProblems([{ ...a!, sourceKey: "another-key" }], { studentExamRepository: repo });
    expect(out.duplicate).toBe(1);
    expect(repo.problems.size).toBe(1);
  });
});

describe("import report", () => {
  it("counts come from the parsed data and list every skipped block", () => {
    const report = buildImportReport([parse()], new Date("2026-10-22T00:00:00Z"));
    expect(report.totals).toMatchObject({ problems: 6, needsReview: 4, imported: 2, skipped: 1, withoutModelAnswer: 3 });
    expect(report.skipped.map((s) => s.reason)).toEqual(["DUPLICATE_STATEMENT"]);
    expect(report.flagCounts.EMPTY_MODEL_ANSWER).toBe(1);
    expect(report.flagCounts.DUPLICATE_STATEMENT).toBe(1);
    expect(report.files[0]).toMatchObject({ sourceFile: "criminal.docx", area: "CRIMINAL", headings: 7 });
  });
});
