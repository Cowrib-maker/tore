import { REVIEW_FLAGS, type ExamArea, type ReviewFlag } from "@/domain/student/exam/types";

import type { ParseResult, ParsedProblem } from "./docx-problem-parser";

export type ImportReport = {
  generatedAt: string;
  files: Array<{
    sourceFile: string;
    area: ExamArea;
    headings: number;
    imported: number;
    needsReview: number;
    skipped: number;
    withoutModelAnswer: number;
  }>;
  totals: { problems: number; needsReview: number; imported: number; skipped: number; withoutModelAnswer: number };
  flagCounts: Partial<Record<ReviewFlag, number>>;
  problems: Array<{
    area: ExamArea;
    ordinalLabel: string;
    status: ParsedProblem["reviewStatus"];
    flags: ReviewFlag[];
    lines: [number, number];
    statementChars: number;
    questionCount: number;
    answerChars: number;
    provisions: number;
    courtCitations: number;
  }>;
  skipped: Array<{ sourceFile: string; heading: string; reason: string; line: number; excerpt: string; duplicateOf?: number }>;
};

/** Summarises parse results for a human to compare against the source documents. Counts come from the data, never from assumptions. */
export function buildImportReport(results: readonly ParseResult[], now: Date = new Date()): ImportReport {
  const flagCounts: Partial<Record<ReviewFlag, number>> = {};
  const problems: ImportReport["problems"] = [];
  const skipped: ImportReport["skipped"] = [];
  const files: ImportReport["files"] = [];

  for (const r of results) {
    for (const p of r.problems) {
      for (const f of p.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
      problems.push({
        area: p.area,
        ordinalLabel: p.ordinalLabel,
        status: p.reviewStatus,
        flags: p.flags,
        lines: [p.locator.paragraphStart, p.locator.paragraphEnd],
        statementChars: p.statement.length,
        questionCount: p.questions.length,
        answerChars: p.modelAnswer?.length ?? 0,
        provisions: p.legalProvisions.length,
        courtCitations: p.courtCitations.length,
      });
    }
    for (const s of r.skipped) skipped.push({ sourceFile: r.sourceFile, ...s });
    files.push({
      sourceFile: r.sourceFile,
      area: r.area,
      headings: r.problems.length + r.skipped.length,
      imported: r.problems.filter((p) => p.reviewStatus !== "NEEDS_REVIEW").length,
      needsReview: r.problems.filter((p) => p.reviewStatus === "NEEDS_REVIEW").length,
      skipped: r.skipped.length,
      withoutModelAnswer: r.problems.filter((p) => p.modelAnswer === null).length,
    });
  }

  const sum = (k: keyof ImportReport["files"][number]) => files.reduce((s, f) => s + (f[k] as number), 0);
  for (const f of REVIEW_FLAGS) if (flagCounts[f] === undefined) delete flagCounts[f];
  return {
    generatedAt: now.toISOString(),
    files,
    totals: {
      problems: problems.length,
      needsReview: sum("needsReview"),
      imported: sum("imported"),
      skipped: sum("skipped"),
      withoutModelAnswer: sum("withoutModelAnswer"),
    },
    flagCounts,
    problems,
    skipped,
  };
}
