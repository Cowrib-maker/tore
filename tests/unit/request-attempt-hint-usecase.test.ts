
import { describe, expect, it } from "vitest";

import { requestAttemptHintUseCase } from "@/application/use-cases/student/request-attempt-hint";
import { InMemoryStudentAttemptRepository } from "@/infrastructure/repositories/in-memory-student-attempt-repository";
import type { AttemptRevision } from "@/domain/student/written-exam-types";

const PROBLEM_ID = "administrative-written-exam-1";
const SESSION_A = "g1";
const SESSION_B = "g2";

function revisionWithFeedback(
  elementFeedback: AttemptRevision["evaluation"]["elementFeedback"],
): AttemptRevision {
  return {
    answer: "хариулт",
    submittedAt: new Date().toISOString(),
    evaluation: {
      mode: "fallback",
      issueSpotting: { status: "missing", note: "" },
      authoritySelection: { status: "missing", note: "" },
      methodology: { status: "missing", note: "" },
      subsumption: { status: "missing", note: "" },
      conclusion: { status: "missing", note: "" },
      elementFeedback,
      hints: [],
      overallFeedback: "",
      needsSourceVerification: false,
    },
  };
}

describe("requestAttemptHintUseCase", () => {
  it("returns not_found for an unknown attemptId", async () => {
    const result = await requestAttemptHintUseCase(
      { attemptId: "does-not-exist", guestSessionId: SESSION_A },
      { repository: new InMemoryStudentAttemptRepository() },
    );

    expect(result).toEqual({ error: "not_found" });
  });

  it("returns not_found when another guest session requests the attempt", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const attempt = await repository.create({
      problemId: PROBLEM_ID,
      trackId: "administrative",
      guestSessionId: SESSION_A,
    });

    const result = await requestAttemptHintUseCase(
      { attemptId: attempt.id, guestSessionId: SESSION_B },
      { repository },
    );

    expect(result).toEqual({ error: "not_found" });
  });

  it("returns no_attempt_yet when the attempt has no revisions", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const attempt = await repository.create({
      problemId: PROBLEM_ID,
      trackId: "administrative",
      guestSessionId: SESSION_A,
    });

    const result = await requestAttemptHintUseCase(
      { attemptId: attempt.id, guestSessionId: SESSION_A },
      { repository },
    );

    expect(result).toEqual({ error: "no_attempt_yet" });
  });

  it("derives a hint and appends it without duplicating answerHistory", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const attempt = await repository.create({
      problemId: PROBLEM_ID,
      trackId: "administrative",
      guestSessionId: SESSION_A,
    });

    const revision = revisionWithFeedback([
      {
        elementId: "administrative:admissibility:1.1-legal-dispute",
        label: "x",
        status: "NOT_SATISFIED",
        explanation: "",
        provenance: [],
      },
    ]);

    await repository.appendRevision({
      id: attempt.id,
      guestSessionId: SESSION_A,
      revision,
    });

    const hint = await requestAttemptHintUseCase(
      { attemptId: attempt.id, guestSessionId: SESSION_A },
      { repository },
    );

    expect("error" in hint).toBe(false);
    if ("error" in hint) return;

    expect(hint.elementId).toBe("administrative:admissibility:1.1-legal-dispute");

    const updated = await repository.findById(attempt.id, SESSION_A);
    expect(updated!.hintsRevealed).toHaveLength(1);
    expect(updated!.answerHistory).toHaveLength(1);
  });

  it("returns no_hint_available once every required element is satisfied", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const attempt = await repository.create({
      problemId: PROBLEM_ID,
      trackId: "administrative",
      guestSessionId: SESSION_A,
    });

    const problemModule = await import("@/domain/student/written-exam-problems");
    const problem = problemModule.findWrittenExamProblemById(PROBLEM_ID)!;

    const allSatisfied = problem.rubric.map((item) => ({
      elementId: item.elementId,
      label: item.label,
      status: "SATISFIED" as const,
      explanation: "",
      provenance: item.provenance,
    }));

    await repository.appendRevision({
      id: attempt.id,
      guestSessionId: SESSION_A,
      revision: revisionWithFeedback(allSatisfied),
    });

    const result = await requestAttemptHintUseCase(
      { attemptId: attempt.id, guestSessionId: SESSION_A },
      { repository },
    );

    expect(result).toEqual({ error: "no_hint_available" });
  });

  it("does not reveal the same element's hint twice", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const attempt = await repository.create({
      problemId: PROBLEM_ID,
      trackId: "administrative",
      guestSessionId: SESSION_A,
    });

    await repository.appendRevision({
      id: attempt.id,
      guestSessionId: SESSION_A,
      revision: revisionWithFeedback([]),
    });

    const first = await requestAttemptHintUseCase(
      { attemptId: attempt.id, guestSessionId: SESSION_A },
      { repository },
    );

    const second = await requestAttemptHintUseCase(
      { attemptId: attempt.id, guestSessionId: SESSION_A },
      { repository },
    );

    if ("error" in first || "error" in second) {
      throw new Error("unexpected error");
    }

    expect(first.elementId).not.toBe(second.elementId);
  });
});
