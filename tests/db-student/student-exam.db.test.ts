import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getAttemptResult,
  getRunnerView,
  saveAnswer,
  startExam,
  submitAttempt,
  submitSelfAssessment,
  type ExamDeps,
} from "@/application/student-exam/exam-service";
import { ConflictError } from "@/domain/errors/domain-error";
import { defaultRubric } from "@/domain/student/exam/rubric";
import { DEADLINE_GRACE_MS } from "@/domain/student/exam/types";
import { prisma } from "@/infrastructure/database/prisma";
import { PrismaStudentExamRepository } from "@/infrastructure/repositories/prisma-student-exam-repository";

/**
 * REAL PostgreSQL: migration objects, partial unique indexes, CHECK constraints, row locking, cascade and the exam lifecycle.
 * Same guards as student-progress.db.test.ts (see setup-env.ts). Run with `npm run test:student-db`.
 */
const repo = new PrismaStudentExamRepository(prisma);
const run = randomUUID().slice(0, 8);
const KEY = "DB-KEY-SENTINEL";
let clock = new Date("2026-10-22T09:00:00.000Z");
const deps: ExamDeps = { studentExamRepository: repo, now: () => new Date(clock), randomSeed: () => randomUUID() };
const createdUsers: string[] = [];
const problemIds: string[] = [];

async function newUser(label: string) {
  const u = await prisma.user.create({
    data: { email: `student-exam-${run}-${label}@example.test`, role: "CLIENT", name: label },
    select: { id: true },
  });
  createdUsers.push(u.id);
  return u.id;
}

const input = (n: number, over: Record<string, unknown> = {}) => ({
  sourceKey: `db-${run}-${n}`,
  area: "CRIMINAL" as const,
  ordinal: n,
  ordinalLabel: `Бодлого-${n}`,
  statement: `Нөхцөл ${run} ${n}`,
  questions: [`Асуулт ${n}?`],
  sourceFile: "criminal.docx",
  locator: { heading: `Бодлого-${n}`, page: null, paragraphStart: n, paragraphEnd: n + 5 },
  statementHash: `h-${run}-${n}`,
  contentHash: `c-${run}-${n}`,
  flags: [],
  reviewStatus: "IMPORTED" as const,
  key: {
    modelAnswer: `${KEY} ${n}: Эрүүгийн хуулийн 91 дүгээр зүйл`,
    answerOutline: ["Бодолтын процесс"],
    legalProvisions: [{ text: "Эрүүгийн хуулийн 91 дүгээр зүйл", origin: "SOURCE_PATTERN" as const }],
    courtCitations: [],
    rubric: defaultRubric(),
    provenance: "SOURCE_DOCX" as const,
  },
  ...over,
});

beforeAll(async () => {
  const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "users"`;
  if (Number(count) !== 0) throw new Error("Refusing to run: the database is not empty of users.");
  for (let n = 1; n <= 6; n++) {
    expect(await repo.upsertImported(input(n))).toBe("created");
    const row = await prisma.studentExamProblem.findUniqueOrThrow({ where: { sourceKey: `db-${run}-${n}` }, select: { id: true } });
    problemIds.push(row.id);
  }
});

afterAll(async () => {
  if (createdUsers.length) await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  await prisma.studentExamProblem.deleteMany({ where: { sourceKey: { startsWith: `db-${run}-` } } });
  await prisma.studentCourtDecision.deleteMany({ where: { sourceKey: { startsWith: `db-${run}-` } } });
  await prisma.$disconnect();
});

describe("schema objects from the migration", () => {
  it("has the tables, the partial unique indexes and the CHECK constraints", async () => {
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name FROM pg_indexes WHERE tablename = 'student_exam_attempts'
      UNION SELECT conname FROM pg_constraint WHERE conrelid IN ('student_exam_problems'::regclass, 'student_exam_attempts'::regclass)`;
    const names = rows.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "student_exam_attempts_one_active_exam_idx",
        "student_exam_attempts_one_active_study_idx",
        "student_exam_problems_difficulty_range",
        "student_exam_attempts_score_range",
        "student_exam_attempts_mode_shape",
      ]),
    );
  });

  it("rejects a difficulty outside 1-5, a score above the maximum and an EXAM attempt without a deadline", async () => {
    const userId = await newUser("checks");
    await expect(prisma.studentExamProblem.update({ where: { sourceKey: `db-${run}-1` }, data: { difficulty: 6 } })).rejects.toThrow();
    await expect(prisma.studentExamProblem.update({ where: { sourceKey: `db-${run}-1` }, data: { difficulty: 3 } })).resolves.toBeTruthy();
    await expect(prisma.studentExamAttempt.create({ data: { userId, mode: "EXAM" } })).rejects.toThrow(); // mode_shape: no deadline
    await expect(prisma.studentExamAttempt.create({ data: { userId, mode: "STUDY" } })).rejects.toThrow(); // mode_shape: no problem
    const ok = await prisma.studentExamAttempt.create({
      data: { userId, mode: "STUDY", studyProblemId: problemIds[0], status: "SUBMITTED" },
    });
    await expect(prisma.studentExamAttempt.update({ where: { id: ok.id }, data: { scoreTotal: 101, scoreMax: 100 } })).rejects.toThrow();
    await expect(prisma.studentExamAttempt.update({ where: { id: ok.id }, data: { scoreTotal: 50, scoreMax: 100 } })).resolves.toBeTruthy();
  });
});

describe("import on PostgreSQL", () => {
  it("is idempotent, rejects a byte-for-byte duplicate under a new identity, and routes a changed source back to review", async () => {
    // (a) re-importing the exact same source is a no-op.
    expect(await repo.upsertImported(input(1))).toBe("unchanged");

    // (b) same statement hash AND content hash under a brand-new sourceKey, same area: a byte-for-byte repeat of an
    // already-imported problem. Per docs/student-exam-import.md ("Only a byte-for-byte duplicate (same statement, questions
    // and answer) is left out ... The database applies the same rule: identical statement hash and content hash within an
    // area."), this must be rejected, not created as a second row.
    expect(await repo.upsertImported(input(1, { sourceKey: `db-${run}-dup` }))).toBe("duplicate");
    expect(await prisma.studentExamProblem.count({ where: { sourceKey: `db-${run}-dup` } })).toBe(0);
    expect(await prisma.studentExamProblem.count({ where: { sourceKey: { startsWith: `db-${run}-` } } })).toBe(6);

    // Same statement but different questions/answer (a different contentHash), under a new sourceKey: docs are explicit that
    // this is NOT dropped as a duplicate — it "is imported and flagged DUPLICATE_STATEMENT" for a reviewer to resolve. The
    // importer (docx-problem-parser.ts) relies on upsertImported creating this row rather than rejecting it.
    expect(
      await repo.upsertImported(
        input(1, { sourceKey: `db-${run}-near-dup`, contentHash: "other", flags: ["DUPLICATE_STATEMENT"], reviewStatus: "NEEDS_REVIEW" }),
      ),
    ).toBe("created");
    const nearDup = await prisma.studentExamProblem.findUniqueOrThrow({ where: { sourceKey: `db-${run}-near-dup` } });
    expect(nearDup.reviewStatus).toBe("NEEDS_REVIEW");
    expect(nearDup.reviewFlags).toContain("DUPLICATE_STATEMENT");

    // (d) same statement AND content, but a different area: dedup scope is "within an area", so this is not a duplicate either.
    expect(await repo.upsertImported(input(1, { sourceKey: `db-${run}-other-area`, area: "CIVIL" }))).toBe("created");

    await repo.setReview(problemIds[1]!, { status: "APPROVED", note: null, reviewerId: "admin", at: new Date() });
    expect(await repo.upsertImported(input(2))).toBe("unchanged");
    expect((await repo.getProblem(problemIds[1]!))!.reviewStatus).toBe("APPROVED"); // reviewer decision preserved

    // (c) changed content for an existing source routes it back to review instead of silently overwriting the reviewer's call.
    expect(await repo.upsertImported(input(2, { statement: "ӨӨРЧЛӨГДСӨН", contentHash: "changed" }))).toBe("changed");
    const after = (await repo.getProblem(problemIds[1]!))!;
    expect(after.reviewStatus).toBe("NEEDS_REVIEW");
    expect(after.reviewFlags).toContain("SOURCE_CHANGED");
    await repo.upsertImported(input(2)); // restore text for the rest of the suite
    await repo.setReview(problemIds[1]!, { status: "IMPORTED", note: null, reviewerId: "admin", at: new Date() });

    await prisma.studentExamProblem.deleteMany({ where: { sourceKey: { in: [`db-${run}-near-dup`, `db-${run}-other-area`] } } });
  });

  it("concurrent imports of the same problem create one row", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => repo.upsertImported(input(50))));
    expect(results.filter((r) => r === "created")).toHaveLength(1);
    expect(await prisma.studentExamProblem.count({ where: { sourceKey: `db-${run}-50` } })).toBe(1);
  });

  it("keeps the key in its own table and out of the public projection", async () => {
    const [p] = await repo.listProblems({ ids: [problemIds[0]!], statuses: ["IMPORTED", "NEEDS_REVIEW", "APPROVED", "REJECTED"] });
    expect(JSON.stringify(p)).not.toContain(KEY);
    expect((await repo.getKeys([problemIds[0]!]))[0]!.modelAnswer).toContain(KEY);
  });

  it("court decision index upserts are idempotent", async () => {
    const entry = { sourceKey: `db-${run}-d1`, area: "CRIMINAL" as const, chapter: 10, courtDate: "2025-04-23", caseNumber: "2025/ХШТ/48", topic: "Сэдэв", pageFrom: 3, pageTo: 3, sourceFile: "10-р бүлэг.pdf" };
    expect(await repo.upsertCourtDecisions([entry])).toEqual({ created: 1, unchanged: 0, updated: 0 });
    expect(await repo.upsertCourtDecisions([entry])).toEqual({ created: 0, unchanged: 1, updated: 0 });
    expect(await repo.upsertCourtDecisions([{ ...entry, topic: "Өөр" }])).toEqual({ created: 0, unchanged: 0, updated: 1 });
  });
});

describe("exam lifecycle on PostgreSQL", () => {
  it("allows one exam in progress per student even when starts race", async () => {
    const userId = await newUser("race-start");
    const results = await Promise.all(
      Array.from({ length: 8 }, () => startExam(userId, { areas: ["CRIMINAL"], count: 2, minutes: 30 }, deps)),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => (r as { attemptId: string }).attemptId)).size).toBe(1);
    expect(await prisma.studentExamAttempt.count({ where: { userId, mode: "EXAM" } })).toBe(1);
    await expect(
      repo.createAttempt({ userId, mode: "EXAM", config: null, studyProblemId: null, startedAt: new Date(), deadlineAt: new Date(Date.now() + 60_000), problemIds: [problemIds[0]!] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("autosave survives a reload, the key stays hidden until submit, a second submit changes nothing", async () => {
    const userId = await newUser("flow");
    const started = (await startExam(userId, { areas: ["CRIMINAL"], count: 2, minutes: 30 }, deps)) as { attemptId: string };
    const attempt = (await repo.findAttempt(started.attemptId, userId))!;
    const [first] = attempt.items;
    expect(await saveAnswer(userId, started.attemptId, { problemId: first!.problemId, answerText: "Миний хариулт Эрүүгийн хуулийн 91", methodChecks: [0, 3] }, deps)).toMatchObject({ ok: true });

    const view = await getRunnerView(userId, started.attemptId, deps);
    expect(JSON.stringify(view)).not.toContain(KEY);
    expect(JSON.stringify(view)).toContain("Миний хариулт");
    expect(await getAttemptResult(userId, started.attemptId, deps)).toEqual({ ok: false, error: "in_progress" });

    expect(await submitAttempt(userId, started.attemptId, deps)).toEqual({ ok: true, status: "SUBMITTED", alreadyClosed: false });
    const closed = (await repo.findAttempt(started.attemptId, userId))!;
    expect(await submitAttempt(userId, started.attemptId, deps)).toEqual({ ok: true, status: "SUBMITTED", alreadyClosed: true });
    expect((await repo.findAttempt(started.attemptId, userId))!.submittedAt).toEqual(closed.submittedAt);
    expect(await saveAnswer(userId, started.attemptId, { problemId: first!.problemId, answerText: "later" }, deps)).toEqual({ ok: false, error: "closed" });
    expect(JSON.stringify(await getAttemptResult(userId, started.attemptId, deps))).toContain(KEY);

    // Score is computed on the server from ratings only, and locks.
    const ratings = Object.fromEntries(attempt.items.map((i) => [i.problemId, { issues: 4, law: 4, interpretation: 4, application: 4, counter: 2, conclusion: 4 }]));
    const scored = await submitSelfAssessment(userId, started.attemptId, ratings, deps);
    expect(scored).toEqual({ ok: true, scoreTotal: 190, scoreMax: 200 });
    expect(await submitSelfAssessment(userId, started.attemptId, ratings, deps)).toEqual({ ok: false, error: "already_finalized" });
  });

  it("racing autosaves and a submit leave a consistent attempt: nothing is written after the submit committed", async () => {
    const userId = await newUser("race-submit");
    const started = (await startExam(userId, { areas: ["CRIMINAL"], count: 1, minutes: 30 }, deps)) as { attemptId: string };
    const problemId = (await repo.findAttempt(started.attemptId, userId))!.items[0]!.problemId;
    const saves = Array.from({ length: 25 }, (_, i) => saveAnswer(userId, started.attemptId, { problemId, answerText: `v${i}` }, deps));
    const submits = Array.from({ length: 5 }, () => submitAttempt(userId, started.attemptId, deps));
    const settled = await Promise.all([...saves, ...submits]);

    const after = (await repo.findAttempt(started.attemptId, userId))!;
    expect(after.status).toBe("SUBMITTED");
    const submitsFirst = settled.slice(25).filter((r) => r.ok && !(r as { alreadyClosed: boolean }).alreadyClosed);
    expect(submitsFirst).toHaveLength(1);
    // Whatever text is stored came from a save that reported success; later saves were refused.
    const okTexts = settled.slice(0, 25).map((r, i) => (r.ok ? `v${i}` : null)).filter(Boolean);
    expect(after.items[0]!.answerText === "" || okTexts.includes(after.items[0]!.answerText)).toBe(true);
    const refused = settled.slice(0, 25).filter((r) => !r.ok);
    expect(refused.every((r) => !r.ok && r.error === "closed")).toBe(true);
    expect(await saveAnswer(userId, started.attemptId, { problemId, answerText: "late" }, deps)).toEqual({ ok: false, error: "closed" });
  });

  it("expires by the server clock, keeping saved answers, and rejects writes after the grace period", async () => {
    const userId = await newUser("expiry");
    const started = (await startExam(userId, { areas: ["CRIMINAL"], count: 1, minutes: 10 }, deps)) as { attemptId: string };
    const problemId = (await repo.findAttempt(started.attemptId, userId))!.items[0]!.problemId;
    await saveAnswer(userId, started.attemptId, { problemId, answerText: "saved in time" }, deps);

    const deadline = (await repo.findAttempt(started.attemptId, userId))!.deadlineAt!;
    const original = clock;
    clock = new Date(deadline.getTime() + DEADLINE_GRACE_MS - 1);
    expect(await saveAnswer(userId, started.attemptId, { problemId, answerText: "inside grace" }, deps)).toMatchObject({ ok: true });
    clock = new Date(deadline.getTime() + DEADLINE_GRACE_MS + 1);
    expect(await saveAnswer(userId, started.attemptId, { problemId, answerText: "too late" }, deps)).toEqual({ ok: false, error: "expired" });
    const done = (await repo.findAttempt(started.attemptId, userId))!;
    expect(done.status).toBe("EXPIRED");
    expect(done.items[0]!.answerText).toBe("inside grace");
    clock = original;
  });

  it("isolates students: another user cannot see, write to or lock the attempt", async () => {
    const owner = await newUser("owner");
    const other = await newUser("other");
    const started = (await startExam(owner, { areas: ["CRIMINAL"], count: 1, minutes: 30 }, deps)) as { attemptId: string };
    expect(await repo.findAttempt(started.attemptId, other)).toBeNull();
    expect(await repo.withLockedAttempt(started.attemptId, other, async () => "entered")).toBeNull();
    const problemId = (await repo.findAttempt(started.attemptId, owner))!.items[0]!.problemId;
    expect(await saveAnswer(other, started.attemptId, { problemId, answerText: "x" }, deps)).toEqual({ ok: false, error: "not_found" });
  });

  it("deleting the account removes its attempts and answers but never the problem bank", async () => {
    const userId = await newUser("cascade");
    await startExam(userId, { areas: ["CRIMINAL"], count: 2, minutes: 30 }, deps);
    const attempts = await prisma.studentExamAttempt.findMany({ where: { userId }, select: { id: true } });
    expect(attempts).toHaveLength(1);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.studentExamAttempt.count({ where: { userId } })).toBe(0);
    expect(await prisma.studentExamAttemptItem.count({ where: { attemptId: attempts[0]!.id } })).toBe(0);
    expect(await prisma.studentExamProblem.count({ where: { id: { in: problemIds } } })).toBe(6);
  });

  it("a problem that attempts reference cannot be deleted (history is protected)", async () => {
    const userId = await newUser("restrict");
    await startExam(userId, { areas: ["CRIMINAL"], count: 6, minutes: 30 }, deps);
    await expect(prisma.studentExamProblem.delete({ where: { id: problemIds[0]! } })).rejects.toThrow();
  });
});
