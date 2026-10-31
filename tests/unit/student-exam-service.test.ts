import { beforeEach, describe, expect, it } from "vitest";

import {
  browseProblems,
  getAttemptResult,
  getHub,
  getRunnerView,
  openStudy,
  saveAnswer,
  startExam,
  submitAttempt,
  submitSelfAssessment,
  validateStartInput,
  type StartExamInput,
} from "@/application/student-exam/exam-service";
import { drawExamProblems } from "@/domain/student/exam/selection";
import { DEADLINE_GRACE_MS } from "@/domain/student/exam/types";

import { KEY_SENTINEL, makeKit, ratingsFor, seedProblems, fullRatings, type Kit } from "./helpers/student-exam-kit";

let kit: Kit;
beforeEach(() => {
  kit = makeKit();
});

const config = { areas: ["CRIMINAL"], count: 3, minutes: 60 };

async function startedAttempt(userId = "alice", input: StartExamInput = config) {
  const r = await startExam(userId, input, kit.deps);
  if (!r.ok) throw new Error(`start failed: ${r.error}`);
  return r.attemptId;
}

describe("starting an exam", () => {
  beforeEach(async () => {
    await seedProblems(kit.repo, "CRIMINAL", 6);
    await seedProblems(kit.repo, "CIVIL", 4);
  });

  it.each([
    ["no areas", { ...config, areas: [] }],
    ["unknown area", { ...config, areas: ["TAX"] }],
    ["zero questions", { ...config, count: 0 }],
    ["too many questions", { ...config, count: 21 }],
    ["fractional count", { ...config, count: 2.5 }],
    ["too short", { ...config, minutes: 5 }],
    ["too long", { ...config, minutes: 241 }],
    ["bad weight", { ...config, areaWeights: { CRIMINAL: -1 } }],
    ["inverted difficulty", { ...config, difficultyMin: 4, difficultyMax: 2 }],
  ])("rejects %s", async (_n, input) => {
    expect(await startExam("alice", input, kit.deps)).toEqual({ ok: false, error: "invalid" });
    expect(kit.repo.attempts.size).toBe(0);
  });

  it("draws the requested number of distinct problems from the chosen areas only", async () => {
    const id = await startedAttempt("alice", { areas: ["CIVIL"], count: 4, minutes: 30 });
    const attempt = await kit.repo.findAttempt(id, "alice");
    const ids = attempt!.items.map((i) => i.problemId);
    expect(new Set(ids).size).toBe(4);
    for (const pid of ids) expect(kit.repo.problems.get(pid)!.area).toBe("CIVIL");
    expect(attempt!.deadlineAt!.getTime() - attempt!.startedAt.getTime()).toBe(30 * 60_000);
    expect(attempt!.config!.seed).toBe("seed-1"); // recorded for audit
  });

  it("never draws problems that are under review or rejected", async () => {
    await seedProblems(kit.repo, "CRIMINAL", 5, "NEEDS_REVIEW");
    await seedProblems(kit.repo, "CRIMINAL", 5, "REJECTED");
    await seedProblems(kit.repo, "ADMINISTRATIVE", 3, "NEEDS_REVIEW");
    for (let i = 0; i < 20; i++) {
      const r = await startExam(`u${i}`, { areas: ["CRIMINAL"], count: 6, minutes: 30 }, kit.deps);
      expect(r.ok).toBe(true);
      const a = await kit.repo.findAttempt((r as { attemptId: string }).attemptId, `u${i}`);
      for (const item of a!.items) expect(kit.repo.problems.get(item.problemId)!.reviewStatus).toBe("IMPORTED");
    }
    expect(await startExam("zed", { areas: ["ADMINISTRATIVE"], count: 1, minutes: 30 }, kit.deps)).toEqual({ ok: false, error: "not_enough_problems" });
  });

  it("refuses an exam larger than the available pool", async () => {
    expect(await startExam("alice", { areas: ["CIVIL"], count: 5, minutes: 30 }, kit.deps)).toEqual({ ok: false, error: "not_enough_problems" });
  });

  it("is a reproducible draw for a given seed and a different draw for other seeds", async () => {
    const pool = await kit.repo.listProblems({ statuses: ["IMPORTED"] });
    const cfg = { areas: ["CRIMINAL", "CIVIL"] as const, count: 5, minutes: 30 };
    const draw = (seed: string) => drawExamProblems(pool, { ...cfg, areas: [...cfg.areas], seed }).map((p) => p.id).join(",");
    expect(draw("s1")).toBe(draw("s1"));
    const variants = new Set(Array.from({ length: 30 }, (_, i) => draw(`s${i}`)));
    expect(variants.size).toBeGreaterThan(10);
  });

  it("honours area weights", async () => {
    const pool = await kit.repo.listProblems({ statuses: ["IMPORTED"] });
    const count = (weights: Partial<Record<"CRIMINAL" | "CIVIL", number>>) => {
      let criminal = 0;
      for (let i = 0; i < 200; i++) {
        const drawn = drawExamProblems(pool, { areas: ["CRIMINAL", "CIVIL"], count: 3, minutes: 30, seed: `w${i}`, areaWeights: weights });
        criminal += drawn.filter((p) => p.area === "CRIMINAL").length;
      }
      return criminal;
    };
    expect(count({ CRIMINAL: 20 })).toBeGreaterThan(count({ CIVIL: 20 }));
  });

  it("applies a difficulty window but keeps unrated problems eligible", async () => {
    const pool = await kit.repo.listProblems({ statuses: ["IMPORTED"] });
    const rated = pool.map((p, i) => ({ ...p, difficulty: i % 2 === 0 ? 1 : 5 }));
    const drawn = drawExamProblems(rated, { areas: ["CRIMINAL", "CIVIL"], count: 10, minutes: 30, seed: "d", difficultyMin: 4, difficultyMax: 5 });
    expect(drawn.every((p) => p.difficulty === 5)).toBe(true);
    const unrated = drawExamProblems(pool, { areas: ["CRIMINAL"], count: 3, minutes: 30, seed: "d", difficultyMin: 4 });
    expect(unrated).toHaveLength(3);
  });

  it("validates input shape directly", () => {
    expect(validateStartInput({ areas: ["CRIMINAL", "CRIMINAL"], count: 2, minutes: 20 })?.areas).toEqual(["CRIMINAL"]);
  });
});

describe("resuming and double starts", () => {
  beforeEach(async () => {
    await seedProblems(kit.repo, "CRIMINAL", 8);
  });

  it("starting again while an exam is in progress resumes it instead of creating another", async () => {
    const first = await startExam("alice", config, kit.deps);
    const second = await startExam("alice", { ...config, count: 5 }, kit.deps);
    expect(first).toMatchObject({ ok: true, resumed: false });
    expect(second).toMatchObject({ ok: true, resumed: true, attemptId: (first as { attemptId: string }).attemptId });
    expect([...kit.repo.attempts.values()].filter((a) => a.userId === "alice")).toHaveLength(1);
  });

  it("concurrent starts produce exactly one attempt", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => startExam("alice", config, kit.deps)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => (r as { attemptId: string }).attemptId)).size).toBe(1);
    expect(kit.repo.attempts.size).toBe(1);
  });

  it("an expired exam is closed and a new one can be started", async () => {
    const first = await startedAttempt();
    kit.advance(61 * 60_000);
    const second = await startExam("alice", config, kit.deps);
    expect(second).toMatchObject({ ok: true, resumed: false });
    expect((second as { attemptId: string }).attemptId).not.toBe(first);
    expect(kit.repo.attempts.get(first)!.status).toBe("EXPIRED");
  });

  it("different students each get their own attempt", async () => {
    const a = await startedAttempt("alice");
    const b = await startedAttempt("bob");
    expect(a).not.toBe(b);
  });
});

describe("question payload never contains an answer key", () => {
  beforeEach(async () => {
    await seedProblems(kit.repo, "CRIMINAL", 4);
  });

  it("the runner view carries the problems and the student's own answers, with no key material", async () => {
    const id = await startedAttempt();
    const r = await getRunnerView("alice", id, kit.deps);
    expect(r).toMatchObject({ ok: true });
    const json = JSON.stringify(r);
    expect(json).not.toContain(KEY_SENTINEL);
    expect(json).not.toMatch(/modelAnswer|rubric|legalProvisions|courtCitations|answerOutline/);
    const view = (r as { view: { problems: Array<{ statement: string }>; deadlineAt: string; serverNow: string } }).view;
    expect(view.problems).toHaveLength(3);
    expect(view.problems[0]!.statement).toContain("Нөхцөл");
    expect(Date.parse(view.deadlineAt) - Date.parse(view.serverNow)).toBe(60 * 60_000);
  });

  it("the browse list and hub never include keys either", async () => {
    await startedAttempt();
    const browse = await browseProblems("alice", {}, kit.deps);
    const hub = await getHub("alice", kit.deps);
    expect(JSON.stringify(browse)).not.toContain(KEY_SENTINEL);
    expect(JSON.stringify(hub)).not.toContain(KEY_SENTINEL);
  });

  it("another student cannot open the attempt", async () => {
    const id = await startedAttempt("alice");
    expect(await getRunnerView("mallory", id, kit.deps)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("autosave, refresh and recovery", () => {
  let attemptId: string;
  let problemIds: string[];
  beforeEach(async () => {
    await seedProblems(kit.repo, "CRIMINAL", 4);
    attemptId = await startedAttempt();
    problemIds = (await kit.repo.findAttempt(attemptId, "alice"))!.items.map((i) => i.problemId);
  });

  it("saves an answer and returns it after a reload (restore after refresh)", async () => {
    const saved = await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "Миний хариулт", methodChecks: [0, 2] }, kit.deps);
    expect(saved).toMatchObject({ ok: true });
    const view = (await getRunnerView("alice", attemptId, kit.deps)) as { view: { problems: Array<{ answerText: string; methodChecks: number[] }> } };
    expect(view.view.problems[0]).toMatchObject({ answerText: "Миний хариулт", methodChecks: [0, 2] });
  });

  it("the last write wins and does not touch other problems", async () => {
    await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "a1" }, kit.deps);
    await saveAnswer("alice", attemptId, { problemId: problemIds[1], answerText: "b1" }, kit.deps);
    await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "a2" }, kit.deps);
    const a = await kit.repo.findAttempt(attemptId, "alice");
    expect(a!.items.map((i) => i.answerText)).toEqual(["a2", "b1", ""]);
  });

  it.each([
    ["non-string answer", { problemId: "x", answerText: 5 }],
    ["answer too long", { answerText: "x".repeat(20_001) }],
    ["bad method step", { answerText: "x", methodChecks: [9] }],
    ["method checks not an array", { answerText: "x", methodChecks: "all" }],
  ])("rejects %s", async (_n, extra) => {
    const r = await saveAnswer("alice", attemptId, { problemId: problemIds[0], ...extra } as never, kit.deps);
    expect(r).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects a problem that is not part of the attempt", async () => {
    const r = await saveAnswer("alice", attemptId, { problemId: "someone-elses", answerText: "x" }, kit.deps);
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("another student cannot write into the attempt", async () => {
    const r = await saveAnswer("mallory", attemptId, { problemId: problemIds[0], answerText: "hijack" }, kit.deps);
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect((await kit.repo.findAttempt(attemptId, "alice"))!.items[0]!.answerText).toBe("");
  });

  it("accepts a late autosave inside the grace period but not after it", async () => {
    kit.advance(60 * 60_000 + DEADLINE_GRACE_MS - 1);
    expect(await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "last second" }, kit.deps)).toMatchObject({ ok: true });
    kit.advance(2);
    expect(await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "too late" }, kit.deps)).toEqual({ ok: false, error: "expired" });
    const a = await kit.repo.findAttempt(attemptId, "alice");
    expect(a!.status).toBe("EXPIRED");
    expect(a!.items[0]!.answerText).toBe("last second");
  });

  it("expiry is resolved by the server when the page is reopened after the deadline", async () => {
    await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "kept" }, kit.deps);
    kit.advance(2 * 60 * 60_000);
    expect(await getRunnerView("alice", attemptId, kit.deps)).toMatchObject({ ok: true, closed: true, mode: "EXAM" });
    expect(kit.repo.attempts.get(attemptId)!.status).toBe("EXPIRED");
    expect(kit.repo.attempts.get(attemptId)!.items[0]!.answerText).toBe("kept");
  });
});

describe("submission", () => {
  let attemptId: string;
  let problemIds: string[];
  beforeEach(async () => {
    await seedProblems(kit.repo, "CRIMINAL", 4);
    attemptId = await startedAttempt();
    problemIds = (await kit.repo.findAttempt(attemptId, "alice"))!.items.map((i) => i.problemId);
    await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "Эрүүгийн хуулийн 91 дүгээр зүйлээр зүйлчилнэ" }, kit.deps);
  });

  it("closes the attempt, records the time and the orientation indicators", async () => {
    expect(await submitAttempt("alice", attemptId, kit.deps)).toEqual({ ok: true, status: "SUBMITTED", alreadyClosed: false });
    const a = kit.repo.attempts.get(attemptId)!;
    expect(a.status).toBe("SUBMITTED");
    expect(a.submittedAt).toEqual(kit.clock.now);
    expect(a.items[0]!.autoIndicators).toMatchObject({ provisionsExpected: 1, provisionsMentioned: ["Эрүүгийн хуулийн 91 дүгээр зүйл"] });
    expect(a.items[1]!.autoIndicators!.provisionsMentioned).toEqual([]);
  });

  it("a duplicate submit changes nothing and reports the first outcome", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    const first = structuredClone(kit.repo.attempts.get(attemptId)!);
    kit.advance(5000);
    expect(await submitAttempt("alice", attemptId, kit.deps)).toEqual({ ok: true, status: "SUBMITTED", alreadyClosed: true });
    expect(kit.repo.attempts.get(attemptId)).toEqual(first);
  });

  it("concurrent submits close the attempt exactly once", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => submitAttempt("alice", attemptId, kit.deps)));
    expect(results.filter((r) => r.ok && !r.alreadyClosed)).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.alreadyClosed)).toHaveLength(7);
  });

  it("answers cannot change after submission", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    expect(await saveAnswer("alice", attemptId, { problemId: problemIds[0], answerText: "tampered" }, kit.deps)).toEqual({ ok: false, error: "closed" });
    expect(kit.repo.attempts.get(attemptId)!.items[0]!.answerText).toContain("91");
  });

  it("an autosave racing a submit either lands before it or is refused, never after", async () => {
    const [save, submit] = await Promise.all([
      saveAnswer("alice", attemptId, { problemId: problemIds[1], answerText: "racing" }, kit.deps),
      submitAttempt("alice", attemptId, kit.deps),
    ]);
    expect(submit).toMatchObject({ ok: true });
    const stored = kit.repo.attempts.get(attemptId)!.items[1]!.answerText;
    expect(stored).toBe(save.ok ? "racing" : "");
    expect(await saveAnswer("alice", attemptId, { problemId: problemIds[1], answerText: "after" }, kit.deps)).toEqual({ ok: false, error: "closed" });
  });

  it("a submit after the deadline is recorded as expired at the deadline, not at the late click", async () => {
    kit.advance(60 * 60_000 + DEADLINE_GRACE_MS + 1000);
    expect(await submitAttempt("alice", attemptId, kit.deps)).toEqual({ ok: true, status: "EXPIRED", alreadyClosed: false });
    const a = kit.repo.attempts.get(attemptId)!;
    expect(a.submittedAt).toEqual(a.deadlineAt);
  });

  it("another student cannot submit it", async () => {
    expect(await submitAttempt("mallory", attemptId, kit.deps)).toEqual({ ok: false, error: "not_found" });
    expect(kit.repo.attempts.get(attemptId)!.status).toBe("IN_PROGRESS");
  });
});

describe("answer keys are released only after the attempt is closed", () => {
  let attemptId: string;
  beforeEach(async () => {
    await seedProblems(kit.repo, "CRIMINAL", 4);
    attemptId = await startedAttempt();
  });

  it("refuses the result while in progress", async () => {
    expect(await getAttemptResult("alice", attemptId, kit.deps)).toEqual({ ok: false, error: "in_progress" });
  });

  it("returns model answers, outline, provisions and rubric after submission", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    const r = await getAttemptResult("alice", attemptId, kit.deps);
    expect(r.ok).toBe(true);
    const result = (r as { result: { items: Array<{ key: { modelAnswer: string; provenance: string; answerOutline: string[] } }> } }).result;
    expect(result.items).toHaveLength(3);
    expect(result.items[0]!.key.modelAnswer).toContain(KEY_SENTINEL);
    expect(result.items[0]!.key.provenance).toBe("SOURCE_DOCX");
    expect(result.items[0]!.key.answerOutline).toEqual(["Бодолтын процесс"]);
  });

  it("returns the key after the server expired the attempt", async () => {
    kit.advance(3 * 60 * 60_000);
    const r = await getAttemptResult("alice", attemptId, kit.deps);
    expect(r).toMatchObject({ ok: true });
  });

  it("another student cannot read the key or the answers", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    expect(await getAttemptResult("mallory", attemptId, kit.deps)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("server-side scoring (self-assessment against the rubric)", () => {
  let attemptId: string;
  let problemIds: string[];
  beforeEach(async () => {
    await seedProblems(kit.repo, "CRIMINAL", 4);
    attemptId = await startedAttempt();
    problemIds = (await kit.repo.findAttempt(attemptId, "alice"))!.items.map((i) => i.problemId);
  });

  it("is refused while the attempt is in progress", async () => {
    expect(await submitSelfAssessment("alice", attemptId, ratingsFor(problemIds, 4), kit.deps)).toEqual({ ok: false, error: "not_closed" });
  });

  it("computes the total on the server from ratings and the rubric weights", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    const ratings = {
      [problemIds[0]!]: fullRatings(4), // 100
      [problemIds[1]!]: fullRatings(2), // 50
      [problemIds[2]!]: fullRatings(0), // 0
    };
    expect(await submitSelfAssessment("alice", attemptId, ratings, kit.deps)).toEqual({ ok: true, scoreTotal: 150, scoreMax: 300 });
    const a = kit.repo.attempts.get(attemptId)!;
    expect(a.scoreTotal).toBe(150);
    expect(a.items.map((i) => i.scoreAwarded)).toEqual([100, 50, 0]);
  });

  it("weights criteria unequally: only 'application' fully met = 25 points", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    const only = { issues: 0, law: 0, interpretation: 0, application: 4, counter: 0, conclusion: 0 };
    const r = await submitSelfAssessment("alice", attemptId, { [problemIds[0]!]: only, [problemIds[1]!]: only, [problemIds[2]!]: only }, kit.deps);
    expect(r).toEqual({ ok: true, scoreTotal: 75, scoreMax: 300 });
  });

  it("ignores any score the client tries to supply", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    const forged = Object.fromEntries(problemIds.map((id) => [id, { ...fullRatings(0), total: 100, scoreAwarded: 100 }]));
    expect(await submitSelfAssessment("alice", attemptId, forged, kit.deps)).toEqual({ ok: true, scoreTotal: 0, scoreMax: 300 });
  });

  it.each([
    ["a missing criterion", (r: Record<string, number>) => { delete r.law; return r; }],
    ["a rating above the scale", (r: Record<string, number>) => ({ ...r, law: 5 })],
    ["a negative rating", (r: Record<string, number>) => ({ ...r, law: -1 })],
    ["a fractional rating", (r: Record<string, number>) => ({ ...r, law: 2.5 })],
    ["a non-numeric rating", (r: Record<string, number>) => ({ ...r, law: "4" as unknown as number })],
  ])("rejects %s and records nothing", async (_n, mutate) => {
    await submitAttempt("alice", attemptId, kit.deps);
    const ratings = Object.fromEntries(problemIds.map((id) => [id, mutate({ ...fullRatings(3) })]));
    expect(await submitSelfAssessment("alice", attemptId, ratings, kit.deps)).toEqual({ ok: false, error: "invalid" });
    expect(kit.repo.attempts.get(attemptId)!.scoreTotal).toBeNull();
  });

  it("requires a rating for every problem", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    expect(await submitSelfAssessment("alice", attemptId, { [problemIds[0]!]: fullRatings(4) }, kit.deps)).toEqual({ ok: false, error: "invalid" });
  });

  it("locks after the first assessment (score cannot be re-rolled) and survives concurrent attempts", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    const results = await Promise.all([4, 0, 2, 3].map((r) => submitSelfAssessment("alice", attemptId, ratingsFor(problemIds, r), kit.deps)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === "already_finalized")).toHaveLength(3);
  });

  it("another student cannot score someone else's attempt", async () => {
    await submitAttempt("alice", attemptId, kit.deps);
    expect(await submitSelfAssessment("mallory", attemptId, ratingsFor(problemIds, 4), kit.deps)).toEqual({ ok: false, error: "not_found" });
    expect(kit.repo.attempts.get(attemptId)!.finalizedAt).toBeNull();
  });
});

describe("results, weak spots and progress over time", () => {
  it("reports weak criteria, retry suggestions and the change since the previous attempt", async () => {
    await seedProblems(kit.repo, "CRIMINAL", 6);
    const run = async (rating: number, weakLaw: boolean) => {
      const id = await startedAttempt("alice", { areas: ["CRIMINAL"], count: 2, minutes: 30 });
      const ids = (await kit.repo.findAttempt(id, "alice"))!.items.map((i) => i.problemId);
      await submitAttempt("alice", id, kit.deps);
      const ratings = Object.fromEntries(ids.map((p) => [p, { ...fullRatings(rating), ...(weakLaw ? { law: 0 } : {}) }]));
      await submitSelfAssessment("alice", id, ratings, kit.deps);
      kit.advance(60_000);
      return id;
    };
    await run(2, false);
    const second = await run(4, true);
    const r = await getAttemptResult("alice", second, kit.deps);
    const result = (r as { result: { weakCriteria: Array<{ id: string; average: number }>; previous: { percent: number; deltaPercent: number }; retryProblemIds: string[]; finalized: boolean } }).result;
    expect(result.finalized).toBe(true);
    expect(result.weakCriteria[0]).toEqual({ id: "law", average: 0 });
    expect(result.previous).toMatchObject({ percent: 50 });
    expect(result.previous.deltaPercent).toBe(35); // 85 per problem (the 'law' criterion, worth 15, scored 0) minus the earlier 50
    expect(result.retryProblemIds).toHaveLength(2);
  });

  it("history lists only the student's own attempts", async () => {
    await seedProblems(kit.repo, "CRIMINAL", 6);
    await startedAttempt("alice");
    await startedAttempt("bob");
    const hubAlice = await getHub("alice", kit.deps);
    expect(hubAlice.history).toHaveLength(1);
    expect(hubAlice.activeExamId).not.toBeNull();
    expect(hubAlice.counts.CRIMINAL).toBe(6);
    const carol = await getHub("carol", kit.deps);
    expect(carol.history).toEqual([]);
    expect(carol.activeExamId).toBeNull();
  });
});

describe("study mode: the model answer appears only after the student submits", () => {
  let problemId: string;
  beforeEach(async () => {
    [problemId] = await seedProblems(kit.repo, "CIVIL", 2);
    await seedProblems(kit.repo, "CIVIL", 1, "NEEDS_REVIEW");
  });

  it("opens one study attempt per problem and resumes it", async () => {
    const a = await openStudy("alice", problemId, {}, kit.deps);
    const b = await openStudy("alice", problemId, {}, kit.deps);
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => openStudy("bob", problemId, {}, kit.deps)));
    expect(new Set(concurrent.map((r) => (r as { attemptId: string }).attemptId)).size).toBe(1);
  });

  it("does not open a problem that is hidden for review or does not exist", async () => {
    const hidden = [...kit.repo.problems.values()].find((p) => p.reviewStatus === "NEEDS_REVIEW")!;
    expect(await openStudy("alice", hidden.id, {}, kit.deps)).toEqual({ ok: false, error: "not_found" });
    expect(await openStudy("alice", "nope", {}, kit.deps)).toEqual({ ok: false, error: "not_found" });
  });

  it("keeps the key hidden until submitted, then reveals it, and a fresh attempt starts clean", async () => {
    const opened = (await openStudy("alice", problemId, {}, kit.deps)) as { attemptId: string };
    await saveAnswer("alice", opened.attemptId, { problemId, answerText: "Миний шийдэл", methodChecks: [0, 1, 2] }, kit.deps);
    expect(await getAttemptResult("alice", opened.attemptId, kit.deps)).toEqual({ ok: false, error: "in_progress" });
    expect(JSON.stringify(await getRunnerView("alice", opened.attemptId, kit.deps))).not.toContain(KEY_SENTINEL);

    await submitAttempt("alice", opened.attemptId, kit.deps);
    const result = await getAttemptResult("alice", opened.attemptId, kit.deps);
    expect(JSON.stringify(result)).toContain(KEY_SENTINEL);
    expect(JSON.stringify(result)).toContain("Миний шийдэл");

    // Re-opening shows the finished attempt; asking for a fresh one starts a new, clean attempt.
    expect(await openStudy("alice", problemId, {}, kit.deps)).toEqual(opened);
    const fresh = (await openStudy("alice", problemId, { fresh: true }, kit.deps)) as { attemptId: string };
    expect(fresh.attemptId).not.toBe(opened.attemptId);
    expect(kit.repo.attempts.get(fresh.attemptId)!.items[0]!.answerText).toBe("");
  });

  it("study attempts have no deadline", async () => {
    const opened = (await openStudy("alice", problemId, {}, kit.deps)) as { attemptId: string };
    kit.advance(30 * 24 * 60 * 60_000);
    expect(await saveAnswer("alice", opened.attemptId, { problemId, answerText: "still fine" }, kit.deps)).toMatchObject({ ok: true });
  });

  it("browse flags studied and in-progress problems per student and filters by area and topic", async () => {
    const [, second] = [...kit.repo.problems.keys()];
    kit.repo.problems.get(second!)!.topic = "Гэрээ";
    const o = (await openStudy("alice", problemId, {}, kit.deps)) as { attemptId: string };
    await submitAttempt("alice", o.attemptId, kit.deps);
    await openStudy("alice", second!, {}, kit.deps);
    const mine = await browseProblems("alice", { area: "CIVIL" }, kit.deps);
    expect(mine.map((m) => [m.studied, m.inProgress])).toEqual([[true, false], [false, true]]);
    const theirs = await browseProblems("bob", { area: "CIVIL" }, kit.deps);
    expect(theirs.every((m) => !m.studied && !m.inProgress)).toBe(true);
    expect(await browseProblems("alice", { area: "CRIMINAL" }, kit.deps)).toEqual([]);
    expect((await browseProblems("alice", { topic: "Гэрээ" }, kit.deps)).map((m) => m.problem.id)).toEqual([second]);
  });
});
