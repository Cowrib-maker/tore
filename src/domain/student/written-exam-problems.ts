/**
 * Domain-agnostic registry for the written-exam pipeline. Administrative
 * is the only populated track this sprint (req #14) — civil/criminal
 * return null here and keep using the legacy `legal-problems.ts` flow
 * until their own source-backed doctrine is built the same way.
 */
import { buildAdministrativeWrittenExamProblem } from "./administrative-written-exam";
import { StudentTrackId } from "./types";
import type { WrittenExamProblem } from "./written-exam-types";

const WRITTEN_EXAM_PROBLEMS: readonly WrittenExamProblem[] = [buildAdministrativeWrittenExamProblem()];

export function getWrittenExamProblem(trackId: StudentTrackId): WrittenExamProblem | null {
  return WRITTEN_EXAM_PROBLEMS.find((problem) => problem.trackId === trackId) ?? null;
}

export function findWrittenExamProblemById(problemId: string): WrittenExamProblem | null {
  return WRITTEN_EXAM_PROBLEMS.find((problem) => problem.id === problemId) ?? null;
}
