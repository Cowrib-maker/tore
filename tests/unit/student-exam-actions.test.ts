import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/domain/errors/domain-error";

import { KEY_SENTINEL, ratingsFor, seedProblems } from "./helpers/student-exam-kit";

const h = vi.hoisted(() => ({
  lookupAuthSession: vi.fn(),
  requireActor: vi.fn(),
  consumeRateLimit: vi.fn(),
  repo: { current: null as unknown },
}));

vi.mock("@/application/common/session", () => ({ lookupAuthSession: () => h.lookupAuthSession() }));
vi.mock("@/application/common/require-actor", () => ({ requireActor: (...a: unknown[]) => h.requireActor(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/infrastructure/security/rate-limiter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/security/rate-limiter")>()),
  consumeRateLimit: (...a: unknown[]) => h.consumeRateLimit(...a),
}));
vi.mock("@/infrastructure/repositories/prisma-student-exam-repository", () => ({
  get studentExamRepository() {
    return h.repo.current;
  },
}));

import {
  browseProblemsForSession,
  getExamHubForSession,
  getResultForSession,
  getRunnerViewForSession,
  listCourtDecisionsForSession,
  listProblemsForReviewAction,
  openStudyAction,
  saveAnswerAction,
  setProblemReviewAction,
  startExamAction,
  submitAttemptAction,
  submitSelfAssessmentAction,
} from "@/application/actions/student-exam.actions";

import { FakeStudentExamRepository } from "./helpers/fake-student-exam-repository";

let repo: FakeStudentExamRepository;
const signedIn = (id: string) => h.lookupAuthSession.mockResolvedValue({ session: { user: { id } }, replaced: false });
const anonymous = () => h.lookupAuthSession.mockResolvedValue({ session: null, replaced: false });
const start = { areas: ["CRIMINAL"], count: 2, minutes: 30 };

beforeEach(async () => {
  repo = new FakeStudentExamRepository();
  h.repo.current = repo;
  h.lookupAuthSession.mockReset();
  h.requireActor.mockReset();
  h.consumeRateLimit.mockReset();
  h.consumeRateLimit.mockResolvedValue({ ok: true });
  await seedProblems(repo, "CRIMINAL", 4);
});

describe("anonymous visitors", () => {
  it("are refused by every action and touch nothing", async () => {
    anonymous();
    const spy = vi.spyOn(repo, "listProblems");
    const results = await Promise.all([
      startExamAction(start),
      openStudyAction("p1", false),
      saveAnswerAction("a1", { problemId: "p1", answerText: "x" }),
      submitAttemptAction("a1"),
      submitSelfAssessmentAction("a1", {}),
      getRunnerViewForSession("a1"),
      getResultForSession("a1"),
      getExamHubForSession(),
      browseProblemsForSession({}),
      listCourtDecisionsForSession(),
    ]);
    for (const r of results) expect(r).toEqual({ ok: false, error: "unauthenticated" });
    expect(spy).not.toHaveBeenCalled();
    expect(repo.attempts.size).toBe(0);
  });
});

describe("identity comes from the session", () => {
  it("starts the attempt for the session user, ignoring any user id in the payload", async () => {
    signedIn("alice");
    const r = await startExamAction({ ...start, userId: "victim" } as never);
    expect(r).toMatchObject({ ok: true });
    const attempt = [...repo.attempts.values()][0]!;
    expect(attempt.userId).toBe("alice");
  });

  it("one student cannot read, write, submit, score or fetch the key of another's attempt", async () => {
    signedIn("alice");
    const started = (await startExamAction(start)) as { attemptId: string };
    const attempt = repo.attempts.get(started.attemptId)!;
    const problemId = attempt.items[0]!.problemId;

    signedIn("mallory");
    expect(await getRunnerViewForSession(started.attemptId)).toEqual({ ok: false, error: "not_found" });
    expect(await saveAnswerAction(started.attemptId, { problemId, answerText: "hijack" })).toEqual({ ok: false, error: "not_found" });
    expect(await submitAttemptAction(started.attemptId)).toEqual({ ok: false, error: "not_found" });
    expect(await getResultForSession(started.attemptId)).toEqual({ ok: false, error: "not_found" });
    expect(await submitSelfAssessmentAction(started.attemptId, ratingsFor([problemId], 4))).toEqual({ ok: false, error: "not_found" });
    expect(repo.attempts.get(started.attemptId)!.status).toBe("IN_PROGRESS");
    expect(attempt.items[0]!.answerText).toBe("");
  });

  it("a full exam round trip releases the key only after submit", async () => {
    signedIn("alice");
    const started = (await startExamAction(start)) as { attemptId: string };
    const runner = await getRunnerViewForSession(started.attemptId);
    expect(JSON.stringify(runner)).not.toContain(KEY_SENTINEL);
    expect(await getResultForSession(started.attemptId)).toEqual({ ok: false, error: "in_progress" });
    expect(await submitAttemptAction(started.attemptId)).toMatchObject({ ok: true, status: "SUBMITTED" });
    expect(JSON.stringify(await getResultForSession(started.attemptId))).toContain(KEY_SENTINEL);
  });
});

describe("failure handling", () => {
  it("maps a rate-limit refusal to rate_limited without doing the work", async () => {
    signedIn("alice");
    h.consumeRateLimit.mockResolvedValue({ ok: false });
    expect(await startExamAction(start)).toEqual({ ok: false, error: "rate_limited" });
    expect(repo.attempts.size).toBe(0);
  });

  it("autosave has its own, larger budget than one-off actions", async () => {
    signedIn("alice");
    await startExamAction(start);
    await saveAnswerAction([...repo.attempts.keys()][0]!, { problemId: [...repo.attempts.values()][0]!.items[0]!.problemId, answerText: "x" });
    const limits = h.consumeRateLimit.mock.calls.map((c) => [c[0], c[1]] as [string, number]);
    const save = limits.find(([k]) => k.includes(":save:"))!;
    const startLimit = limits.find(([k]) => k.includes(":start:"))!;
    expect(save[1]).toBeGreaterThan(startLimit[1]);
  });

  it("returns a safe 'failed' (never an exception or stack) when the database errors", async () => {
    signedIn("alice");
    vi.spyOn(repo, "listProblems").mockRejectedValue(new Error("connection refused: postgres://secret"));
    const r = await startExamAction(start);
    expect(r).toEqual({ ok: false, error: "failed" });
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("rejects an invalid exam configuration with a clear code", async () => {
    signedIn("alice");
    expect(await startExamAction({ areas: ["CRIMINAL"], count: 999, minutes: 30 })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("reviewer actions are admin-only and use the session identity", () => {
  it("non-admins are refused and nothing changes", async () => {
    h.requireActor.mockRejectedValue(new ForbiddenError());
    const id = [...repo.problems.keys()][0]!;
    expect(await listProblemsForReviewAction()).toEqual({ ok: false, error: "forbidden" });
    expect(await setProblemReviewAction({ problemId: id, status: "APPROVED" })).toEqual({ ok: false, error: "forbidden" });
    expect(repo.problems.get(id)!.reviewStatus).toBe("IMPORTED");
    expect(h.requireActor).toHaveBeenCalledWith("ADMIN");
  });

  it("an admin can approve, set topic and difficulty, and the note is stored", async () => {
    h.requireActor.mockResolvedValue({ userId: "admin-1" });
    const id = [...repo.problems.keys()][0]!;
    const spy = vi.spyOn(repo, "setReview");
    expect(await setProblemReviewAction({ problemId: id, status: "APPROVED", note: " checked ", topic: "Гэрээ", difficulty: 3 })).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(id, expect.objectContaining({ status: "APPROVED", note: "checked", reviewerId: "admin-1", topic: "Гэрээ", difficulty: 3 }));
    expect(repo.problems.get(id)).toMatchObject({ reviewStatus: "APPROVED", topic: "Гэрээ", difficulty: 3 });
  });

  it.each([
    ["an unknown status", { status: "PUBLISHED" }],
    ["difficulty 0", { status: "APPROVED", difficulty: 0 }],
    ["difficulty 6", { status: "APPROVED", difficulty: 6 }],
    ["fractional difficulty", { status: "APPROVED", difficulty: 2.5 }],
  ])("rejects %s", async (_n, extra) => {
    h.requireActor.mockResolvedValue({ userId: "admin-1" });
    const id = [...repo.problems.keys()][0]!;
    expect(await setProblemReviewAction({ problemId: id, ...extra } as never)).toEqual({ ok: false, error: "invalid" });
    expect(repo.problems.get(id)!.reviewStatus).toBe("IMPORTED");
  });

  it("reports not_found for an unknown problem and lists items for review", async () => {
    h.requireActor.mockResolvedValue({ userId: "admin-1" });
    expect(await setProblemReviewAction({ problemId: "nope", status: "APPROVED" })).toEqual({ ok: false, error: "not_found" });
    const listed = await listProblemsForReviewAction(["IMPORTED"]);
    expect(listed.ok && listed.items).toHaveLength(4);
  });

  it("rejecting a problem removes it from what students can browse", async () => {
    h.requireActor.mockResolvedValue({ userId: "admin-1" });
    const id = [...repo.problems.keys()][0]!;
    await setProblemReviewAction({ problemId: id, status: "REJECTED" });
    signedIn("alice");
    const browse = await browseProblemsForSession({});
    expect(browse.ok && browse.items.map((i) => i.problem.id)).not.toContain(id);
  });
});
