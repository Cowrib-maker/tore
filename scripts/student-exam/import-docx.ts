/**
 * Lawyer-selection examination problem importer.
 *
 *   npx tsx scripts/student-exam/import-docx.ts --dir <folder with the four DOCX files> [--report <file.json>]
 *
 * DRY RUN by default: parses the DOCX files and writes a report, touching no database. To write to a database pass --write; that
 * path is guarded (see tests/db-student-style guards in scripts/lib/database-url-safety.ts): it refuses anything but an explicitly
 * local database AND requires STUDENT_EXAM_IMPORT_DB_CONFIRM=I_CONFIRM_THIS_DATABASE_IS_DISPOSABLE_OR_AUTHORIZED. Never run it
 * against production; use the staging steps in docs/student-exam-import.md.
 *
 * Files are matched by name (see SOURCES); a missing file is reported, never fabricated.
 */
import fs from "node:fs";
import path from "node:path";

import mammoth from "mammoth";

import { parseProblemDocument, type ParseResult } from "../../src/application/student-exam/import/docx-problem-parser";
import {
  chapterFromFileName,
  parseCourtDecisionIndexFromPages,
} from "../../src/application/student-exam/import/court-decision-index-parser";
import { buildImportReport } from "../../src/application/student-exam/import/import-report";
import type { CourtDecisionInput } from "../../src/domain/repositories/student-exam-repository";
import type { ExamArea } from "../../src/domain/student/exam/types";
import { classifyDatabaseUrl } from "../lib/database-url-safety";

export const SOURCES: ReadonlyArray<{ area: ExamArea; file: string }> = [
  { area: "CRIMINAL", file: "ЭРҮҮГИЙН ЭРХ ЗҮЙН БОДЛОГО.docx" },
  { area: "CIVIL", file: "Иргэний эрх зүйн бодлого.docx" },
  { area: "ADMINISTRATIVE", file: "ЗЭ бодлого.docx" },
  { area: "CONSTITUTIONAL", file: "ҮНДСЭН ХУУЛИЙН ЭРХ ЗҮЙН БОДЛОГО.docx" },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dir = arg("dir");
  if (!dir) {
    console.error("Usage: --dir <folder containing the four source DOCX files> [--report out.json] [--write]");
    process.exit(2);
  }

  const results: ParseResult[] = [];
  const missing: string[] = [];
  for (const s of SOURCES) {
    const full = path.join(dir, s.file);
    if (!fs.existsSync(full)) {
      missing.push(s.file);
      continue;
    }
    const raw = await mammoth.extractRawText({ path: full });
    results.push(parseProblemDocument(raw.value, s.area, s.file));
  }

  // Optional: Supreme Court decision extracts (PDF). Only the table of contents is indexed; no decision text is stored.
  const decisions: CourtDecisionInput[] = [];
  const pdfSummary: Array<{ file: string; entries: number; leaderLines: number; unparsedLeaders: number }> = [];
  const pdfDir = arg("pdf-dir");
  if (pdfDir) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const files = fs.readdirSync(pdfDir).filter((f) => chapterFromFileName(f) !== null && f.toLowerCase().endsWith(".pdf")).sort();
    for (const f of files) {
      const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(path.join(pdfDir, f))));
      const { text } = await extractText(pdf, { mergePages: false });
      const parsed = parseCourtDecisionIndexFromPages(text, "CRIMINAL", f);
      decisions.push(...parsed.entries);
      pdfSummary.push({ file: f, entries: parsed.entries.length, leaderLines: parsed.leaderLines, unparsedLeaders: parsed.leaderLines - parsed.entries.length });
    }
  }

  const report = buildImportReport(results);
  console.log(
    JSON.stringify(
      { missingFiles: missing, totals: report.totals, files: report.files, flagCounts: report.flagCounts, courtDecisionIndex: { entries: decisions.length, files: pdfSummary } },
      null,
      2,
    ),
  );
  const reportPath = arg("report");
  if (reportPath) {
    fs.writeFileSync(reportPath, JSON.stringify({ missingFiles: missing, ...report, courtDecisionIndex: { entries: decisions.length, files: pdfSummary } }, null, 2));
    console.log(`report written to ${reportPath}`);
  }

  if (!process.argv.includes("--write")) {
    console.log("Dry run: no database was touched.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (classifyDatabaseUrl(url).kind !== "local" || process.env.STUDENT_EXAM_IMPORT_DB_CONFIRM !== "I_CONFIRM_THIS_DATABASE_IS_DISPOSABLE_OR_AUTHORIZED") {
    console.error("Refusing to write: DATABASE_URL must be an explicitly local database and STUDENT_EXAM_IMPORT_DB_CONFIRM must be set.");
    process.exit(3);
  }
  const { importParsedProblems } = await import("../../src/application/student-exam/import/import-problems");
  const { studentExamRepository } = await import("../../src/infrastructure/repositories/prisma-student-exam-repository");
  const outcome = await importParsedProblems(results.flatMap((r) => r.problems), { studentExamRepository });
  const decisionOutcome = decisions.length ? await studentExamRepository.upsertCourtDecisions(decisions) : null;
  console.log(JSON.stringify({ writeOutcome: outcome, courtDecisionOutcome: decisionOutcome }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
