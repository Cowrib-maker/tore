import type { ExamDeps } from "@/application/student-exam/exam-service";
import { defaultRubric } from "@/domain/student/exam/rubric";
import type { ExamArea, ReviewStatus } from "@/domain/student/exam/types";

import { FakeStudentExamRepository } from "./fake-student-exam-repository";

export const KEY_SENTINEL = "KEY-SENTINEL";

export type Kit = {
  repo: FakeStudentExamRepository;
  deps: ExamDeps;
  clock: { now: Date };
  advance(ms: number): void;
};

export function makeKit(): Kit {
  const repo = new FakeStudentExamRepository();
  const clock = { now: new Date("2026-10-22T09:00:00.000Z") };
  let seedCounter = 0;
  const deps: ExamDeps = {
    studentExamRepository: repo,
    now: () => new Date(clock.now),
    randomSeed: () => `seed-${++seedCounter}`,
  };
  return { repo, deps, clock, advance: (ms) => (clock.now = new Date(clock.now.getTime() + ms)) };
}

/** Adds `count` problems of an area through the repository's import path (statement unique per problem). */
export async function seedProblems(
  repo: FakeStudentExamRepository,
  area: ExamArea,
  count: number,
  status: ReviewStatus = "IMPORTED",
): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 1; n <= count; n++) {
    const tag = `${area}-${status}-${n}`;
    await repo.upsertImported({
      sourceKey: `key-${tag}`,
      area,
      ordinal: n,
      ordinalLabel: `Бодлого-${n}`,
      statement: `Нөхцөл ${tag}`,
      questions: [`Асуулт: ${tag}?`],
      sourceFile: `${area}.docx`,
      locator: { heading: `Бодлого-${n}`, page: null, paragraphStart: n * 10, paragraphEnd: n * 10 + 5 },
      statementHash: `hash-${tag}`,
      contentHash: `content-${tag}`,
      flags: [],
      reviewStatus: status,
      key: {
        modelAnswer: `${KEY_SENTINEL} ${tag}: Эрүүгийн хуулийн 91 дүгээр зүйл`,
        answerOutline: ["Бодолтын процесс"],
        legalProvisions: [{ text: "Эрүүгийн хуулийн 91 дүгээр зүйл", origin: "SOURCE_PATTERN" }],
        courtCitations: [],
        rubric: defaultRubric(),
        provenance: "SOURCE_DOCX",
      },
    });
    ids.push([...repo.problems.values()].find((p) => p.sourceKey === `key-${tag}`)!.id);
  }
  return ids;
}

export const fullRatings = (rating: number) => ({ issues: rating, law: rating, interpretation: rating, application: rating, counter: rating, conclusion: rating });

export function ratingsFor(problemIds: string[], rating: number) {
  return Object.fromEntries(problemIds.map((id) => [id, fullRatings(rating)]));
}
