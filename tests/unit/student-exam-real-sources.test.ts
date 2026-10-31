import fs from "node:fs";
import path from "node:path";

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";

import { parseCourtDecisionIndexFromPages, chapterFromFileName } from "@/application/student-exam/import/court-decision-index-parser";
import { parseProblemDocument, type ParseResult } from "@/application/student-exam/import/docx-problem-parser";
import { importParsedProblems } from "@/application/student-exam/import/import-problems";
import { buildImportReport } from "@/application/student-exam/import/import-report";
import { STUDENT_VISIBLE_STATUSES } from "@/domain/student/exam/types";

import { FakeStudentExamRepository } from "./helpers/fake-student-exam-repository";

/**
 * Release acceptance against the REAL source files. Skipped unless the folders are given:
 *   STUDENT_EXAM_SOURCE_DIR=<folder with the four DOCX>  STUDENT_EXAM_PDF_DIR=<folder with the nine PDFs>  npx vitest run tests/unit/student-exam-real-sources.test.ts
 * The import target is the in-memory fake repository: this proves the parser and the import rules on the real text, not a database.
 */
const DOCX_DIR = process.env.STUDENT_EXAM_SOURCE_DIR;
const PDF_DIR = process.env.STUDENT_EXAM_PDF_DIR;

const SOURCES = [
  { area: "CRIMINAL", file: "ЭРҮҮГИЙН ЭРХ ЗҮЙН БОДЛОГО.docx" },
  { area: "CIVIL", file: "Иргэний эрх зүйн бодлого.docx" },
  { area: "ADMINISTRATIVE", file: "ЗЭ бодлого.docx" },
  { area: "CONSTITUTIONAL", file: "ҮНДСЭН ХУУЛИЙН ЭРХ ЗҮЙН БОДЛОГО.docx" },
] as const;

/** The reviewed manifest of these exact files (counts established by reading the extracted text, see docs/student-exam-import.md). */
const MANIFEST = {
  records: { CRIMINAL: 15, CIVIL: 15, ADMINISTRATIVE: 15, CONSTITUTIONAL: 4 },
  heldBack: ["CRIMINAL Бодлого-10", "CRIMINAL Бодлого-15", "CIVIL Бодлого 10", "ADMINISTRATIVE Бодлого-6", "ADMINISTRATIVE Бодлого-11"],
  exactDuplicatesSkipped: 0,
  courtDecisionEntries: 48,
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const parsed: ParseResult[] = [];
const rawByFile = new Map<string, string>();

async function load() {
  if (parsed.length) return;
  for (const s of SOURCES) {
    const raw = (await mammoth.extractRawText({ path: path.join(DOCX_DIR!, s.file) })).value;
    rawByFile.set(s.file, raw);
    parsed.push(parseProblemDocument(raw, s.area, s.file));
  }
}

describe.skipIf(!DOCX_DIR)("real DOCX sources", () => {
  it("all four files are present and parse to the reviewed manifest", async () => {
    for (const s of SOURCES) expect(fs.existsSync(path.join(DOCX_DIR!, s.file)), s.file).toBe(true);
    await load();
    for (const r of parsed) expect(r.problems.length, r.sourceFile).toBe(MANIFEST.records[r.area]);
    expect(parsed.flatMap((r) => r.skipped)).toHaveLength(MANIFEST.exactDuplicatesSkipped);
  });

  it("holds back exactly the reviewed records, and students cannot list them", async () => {
    await load();
    const held = parsed.flatMap((r) => r.problems.filter((p) => p.reviewStatus === "NEEDS_REVIEW").map((p) => `${p.area} ${p.ordinalLabel.replace(":", "")}`));
    expect(held.sort()).toEqual([...MANIFEST.heldBack].sort());

    const repo = new FakeStudentExamRepository();
    await importParsedProblems(parsed.flatMap((r) => r.problems), { studentExamRepository: repo });
    const visible = await repo.listProblems({ statuses: STUDENT_VISIBLE_STATUSES });
    expect(visible).toHaveLength(parsed.flatMap((r) => r.problems).length - MANIFEST.heldBack.length);
    for (const v of visible) expect(v.reviewStatus).not.toBe("NEEDS_REVIEW");
    const visibleKeys = new Set(visible.map((v) => `${v.area}|${v.sourceLocator.paragraphStart}`));
    for (const r of parsed) for (const p of r.problems) if (p.reviewStatus === "NEEDS_REVIEW") expect(visibleKeys.has(`${p.area}|${p.locator.paragraphStart}`)).toBe(false);
  });

  it("every non-empty source line is preserved verbatim in some record (nothing silently discarded)", async () => {
    await load();
    for (const r of parsed) {
      const raw = rawByFile.get(r.sourceFile)!;
      const lines = raw.split(/\r?\n/).map((t, i) => ({ t: t.trim(), n: i + 1 })).filter((x) => x.t);
      const haystack = norm(r.problems.map((p) => [p.statement, ...p.questions, p.modelAnswer ?? ""].join("\n")).join("\n"));
      const missing = lines.filter((l) => {
        if (l.n === 1 || /^Бодлого[\s-]*\d+\s*[:.]?\s*$/iu.test(l.t.normalize("NFC"))) return false; // document title and problem headings (kept as labels)
        if (haystack.includes(norm(l.t))) return false;
        const body = l.t.replace(/^(?:Бодлого[\s-]*\d+[\s-]*(?:ийн|ын|ний|ны)?[\s-]*)?(?:жишиг|жишгэ)\s+(?:хариулт|харилт)\s*[:.]?\s*/iu, "");
        return body !== l.t && body !== "" ? !haystack.includes(norm(body)) : body === l.t;
      });
      expect(missing.map((m) => `${r.sourceFile}:${m.n}`), r.sourceFile).toEqual([]);
    }
  });

  it("locators point at the real paragraph ranges and the headings they name", async () => {
    await load();
    for (const r of parsed) {
      const lines = rawByFile.get(r.sourceFile)!.split(/\r?\n/);
      for (const p of r.problems) {
        expect(lines[p.locator.paragraphStart - 1]!.trim(), `${r.sourceFile} ${p.ordinalLabel}`).toBe(p.locator.heading);
        expect(p.locator.paragraphEnd).toBeGreaterThanOrEqual(p.locator.paragraphStart);
        expect(p.locator.page).toBeNull(); // DOCX has no page numbers; none is invented
      }
    }
  });

  it("topic and difficulty are never set by the importer; advisory flags never hide a problem by themselves", async () => {
    await load();
    const repo = new FakeStudentExamRepository();
    await importParsedProblems(parsed.flatMap((r) => r.problems), { studentExamRepository: repo });
    for (const p of repo.problems.values()) {
      expect(p.topic).toBeNull();
      expect(p.difficulty).toBeNull();
    }
    const advisoryOnly = parsed.flatMap((r) => r.problems).filter((p) => p.flags.length > 0 && p.flags.every((f) => ["POSSIBLY_OUTDATED_LAW", "OCR_NOISE_SUSPECTED", "MODEL_ANSWER_TRUNCATED_OR_SHORT"].includes(f)));
    expect(advisoryOnly.length).toBeGreaterThan(0);
    for (const p of advisoryOnly) expect(p.reviewStatus).toBe("IMPORTED");
  });

  it("separates the answer key from everything a student sees, using the real answers", async () => {
    await load();
    const repo = new FakeStudentExamRepository();
    const all = parsed.flatMap((r) => r.problems);
    await importParsedProblems(all, { studentExamRepository: repo });
    const publicJson = JSON.stringify(await repo.listProblems({ statuses: ["IMPORTED", "NEEDS_REVIEW", "APPROVED", "REJECTED"] }));
    for (const p of all) {
      if (!p.modelAnswer) continue;
      const sample = p.modelAnswer.slice(0, 80);
      if (p.statement.includes(sample) || p.questions.join(" ").includes(sample)) continue; // an answer that quotes the question is not a leak
      expect(publicJson.includes(sample), `${p.area} ${p.ordinalLabel}`).toBe(false);
    }
  });

  it("a second import creates nothing, and counts reconcile with the source manifest", async () => {
    await load();
    const repo = new FakeStudentExamRepository();
    const all = parsed.flatMap((r) => r.problems);
    const first = await importParsedProblems(all, { studentExamRepository: repo });
    const second = await importParsedProblems(all, { studentExamRepository: repo });
    expect(first).toMatchObject({ created: all.length, duplicate: 0, changed: 0 });
    expect(second).toMatchObject({ created: 0, unchanged: all.length, duplicate: 0, changed: 0 });
    expect(repo.problems.size).toBe(Object.values(MANIFEST.records).reduce((a, b) => a + b, 0));
    expect(repo.keys.size).toBe(repo.problems.size);
    const report = buildImportReport(parsed);
    expect(report.totals.problems).toBe(repo.problems.size);
    expect(report.totals.needsReview).toBe(MANIFEST.heldBack.length);
  });
});

describe.skipIf(!PDF_DIR)("real court-decision PDFs", () => {
  const files = () => fs.readdirSync(PDF_DIR!).filter((f) => chapterFromFileName(f) !== null && f.toLowerCase().endsWith(".pdf")).sort();

  it("all nine extracts are present and only the table of contents is indexed (no decision text)", async () => {
    expect(files()).toHaveLength(9);
    let total = 0;
    for (const f of files()) {
      const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(path.join(PDF_DIR!, f))));
      const { text } = await extractText(pdf, { mergePages: false });
      const r = parseCourtDecisionIndexFromPages(text, "CRIMINAL", f);
      total += r.entries.length;
      // every entry is metadata: a short topic line, a date, a case number and a page range
      for (const e of r.entries) {
        expect(e.topic.length, `${f} ${e.caseNumber}`).toBeLessThan(400);
        expect(Object.keys(e).sort()).toEqual(["area", "caseNumber", "chapter", "courtDate", "pageFrom", "pageTo", "sourceFile", "sourceKey", "topic"]);
        expect(e.pageFrom).not.toBeNull();
      }
      // the TOC is only the first page(s); the decisions themselves start after it
      expect(r.tocPages).toBeLessThanOrEqual(2);
      expect(r.tocPages).toBeLessThan(text.length);
      // leader lines that are not decisions (e.g. "Хуулийн тайлбар" sections) are reported rather than hidden
      expect(r.leaderLines - r.entries.length).toBeGreaterThanOrEqual(0);
    }
    expect(total).toBe(MANIFEST.courtDecisionEntries);
  });
});
