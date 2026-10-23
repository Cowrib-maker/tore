import type { StudentExamRepository, UpsertOutcome } from "@/domain/repositories/student-exam-repository";

import type { ParsedProblem } from "./docx-problem-parser";

export type ImportOutcome = Record<UpsertOutcome, number> & { total: number };

/**
 * Writes parsed problems through the repository. Safe to run any number of times: identity is the source key, a repeated run
 * reports "unchanged", and a changed source is routed back to review by the repository instead of being overwritten.
 */
export async function importParsedProblems(
  problems: readonly ParsedProblem[],
  deps: { studentExamRepository: StudentExamRepository },
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { created: 0, unchanged: 0, changed: 0, duplicate: 0, total: problems.length };
  for (const p of problems) {
    const result = await deps.studentExamRepository.upsertImported({
      sourceKey: p.sourceKey,
      area: p.area,
      ordinal: p.ordinal,
      ordinalLabel: p.ordinalLabel,
      statement: p.statement,
      questions: p.questions,
      sourceFile: p.sourceFile,
      locator: p.locator,
      statementHash: p.statementHash,
      contentHash: p.contentHash,
      flags: p.flags,
      reviewStatus: p.reviewStatus,
      key: {
        modelAnswer: p.modelAnswer,
        answerOutline: p.answerOutline,
        legalProvisions: p.legalProvisions,
        courtCitations: p.courtCitations,
        rubric: p.rubric,
        provenance: "SOURCE_DOCX",
      },
    });
    outcome[result] += 1;
  }
  return outcome;
}
