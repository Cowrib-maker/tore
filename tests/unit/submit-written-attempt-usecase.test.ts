import { describe, expect, it, vi } from "vitest";

import {
  submitWrittenAttemptUseCase,
  type PrefetchingFactMapper,
} from "@/application/use-cases/student/submit-written-attempt";
import { InMemoryStudentAttemptRepository } from "@/infrastructure/repositories/in-memory-student-attempt-repository";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import type { FactElementMapping, FactMappingInput } from "@/engine/doctrine";

const PROBLEM_ID = "administrative-written-exam-1";

function unconfiguredCompletion(): LegalAiCompletionPort {
  return {
    isConfigured: () => false,
    complete: vi.fn(async () => {
      throw new Error("should never be called when unconfigured");
    }),
  };
}

/** Deterministic test double: maps the student's fact to exactly the given elementId/relation, always with linked evidence when SUPPORTS. */
function fixedMapper(assignments: readonly { elementId: string; relation: "SUPPORTS" | "NEGATES" }[]): PrefetchingFactMapper {
  let lastInput: FactMappingInput | null = null;
  return {
    async prefetch(input) {
      lastInput = input;
    },
    map(input) {
      const factId = input.facts[0]?.id ?? "student-answer";
      const evidenceId = input.evidence[0]?.id ?? null;
      const mappings: FactElementMapping[] = assignments.map(({ elementId, relation }) => ({
        id: `fixed:${factId}:${elementId}`,
        factId,
        elementId,
        relation,
        confidence: "HIGH",
        method: "MANUAL",
        factText: input.facts[0]?.statement ?? "",
        elementSourceText: "",
        explanation: "fixed test mapping",
        evidenceIds: relation === "SUPPORTS" && evidenceId ? [evidenceId] : [],
        provenance: { recordedBy: "caller", applicableAt: input.applicableAt },
      }));
      void lastInput;
      return { mappings, unmappedFactIds: [], notes: [] };
    },
  };
}

const LONG_ENOUGH_ANSWER =
  "Энэхvv шийдвэр нь захиргааны акт мөн бөгөөд нэхэмжлэлийн урьдчилсан нөхцөл хангагдсан гэж vзэж байна. ".repeat(2).trim();

describe("submitWrittenAttemptUseCase", () => {
  it("returns not_found for an unknown problemId", async () => {
    const result = await submitWrittenAttemptUseCase(
      { problemId: "does-not-exist", answer: LONG_ENOUGH_ANSWER, guestSessionId: "guest-1" },
      { repository: new InMemoryStudentAttemptRepository(), completion: unconfiguredCompletion() },
    );
    expect(result).toEqual({ error: "not_found" });
  });

  it("rejects an answer that is too short", async () => {
    const result = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: "богино", guestSessionId: "guest-1" },
      { repository: new InMemoryStudentAttemptRepository(), completion: unconfiguredCompletion() },
    );
    expect(result).toEqual({ error: "too_short" });
  });

  it("creates a new attempt and appends the first revision", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const result = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: LONG_ENOUGH_ANSWER, guestSessionId: "guest-1" },
      { repository, completion: unconfiguredCompletion() },
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.answerHistory).toHaveLength(1);
    expect(result.answerHistory[0]!.answer).toBe(LONG_ENOUGH_ANSWER);
    expect(result.answerHistory[0]!.evaluation.mode).toBe("fallback");
  });

  it("never overwrites a prior answer — a second submission appends, not replaces", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const first = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: LONG_ENOUGH_ANSWER, guestSessionId: "guest-1" },
      { repository, completion: unconfiguredCompletion() },
    );
    expect("error" in first).toBe(false);
    if ("error" in first) return;

    const revisedAnswer = LONG_ENOUGH_ANSWER + " Нэмэлт дvгнэлт.";
    const second = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: revisedAnswer, attemptId: first.id, guestSessionId: "guest-1" },
      { repository, completion: unconfiguredCompletion() },
    );
    expect("error" in second).toBe(false);
    if ("error" in second) return;

    expect(second.id).toBe(first.id);
    expect(second.answerHistory).toHaveLength(2);
    expect(second.answerHistory[0]!.answer).toBe(LONG_ENOUGH_ANSWER);
    expect(second.answerHistory[1]!.answer).toBe(revisedAnswer);
  });

  it("reuses the latest in-progress attempt for the same problem+guest when no attemptId is given", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const first = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: LONG_ENOUGH_ANSWER, guestSessionId: "guest-1" },
      { repository, completion: unconfiguredCompletion() },
    );
    if ("error" in first) throw new Error("unexpected error");

    const second = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: LONG_ENOUGH_ANSWER + " дахин", guestSessionId: "guest-1" },
      { repository, completion: unconfiguredCompletion() },
    );
    if ("error" in second) throw new Error("unexpected error");
    expect(second.id).toBe(first.id);
    expect(second.answerHistory).toHaveLength(2);
  });

  it("marks the attempt graded only once every required element is SATISFIED", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const mapper = fixedMapper([{ elementId: "administrative:admissibility:1.1-legal-dispute", relation: "SUPPORTS" }]);
    const result = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: LONG_ENOUGH_ANSWER, guestSessionId: "guest-1" },
      { repository, completion: unconfiguredCompletion(), mapper },
    );
    if ("error" in result) throw new Error("unexpected error");
    expect(result.status).toBe("in_progress");
    expect(result.finalGrade).toBeNull();
  });

  it("computes finalGrade.total from satisfied element weights when a mapping produces SATISFIED", async () => {
    const repository = new InMemoryStudentAttemptRepository();
    const mapper = fixedMapper([{ elementId: "administrative:admissibility:1.1-legal-dispute", relation: "SUPPORTS" }]);
    const result = await submitWrittenAttemptUseCase(
      { problemId: PROBLEM_ID, answer: LONG_ENOUGH_ANSWER, guestSessionId: "guest-1" },
      { repository, completion: unconfiguredCompletion(), mapper },
    );
    if ("error" in result) throw new Error("unexpected error");
    const feedback = result.answerHistory[0]!.evaluation.elementFeedback;
    const satisfied = feedback.find((f) => f.elementId === "administrative:admissibility:1.1-legal-dispute");
        expect(satisfied?.status).toBe("SATISFIED");
  });

  it("rejects an attemptId owned by another guest session without creating a new attempt", async () => {
    const repository = new InMemoryStudentAttemptRepository();

    const first = await submitWrittenAttemptUseCase(
      {
        problemId: PROBLEM_ID,
        answer: LONG_ENOUGH_ANSWER,
        guestSessionId: "guest-A",
      },
      { repository, completion: unconfiguredCompletion() },
    );

    if ("error" in first) {
      throw new Error("unexpected error while creating the first attempt");
    }

    const result = await submitWrittenAttemptUseCase(
      {
        problemId: PROBLEM_ID,
        answer: LONG_ENOUGH_ANSWER,
        attemptId: first.id,
        guestSessionId: "guest-B",
      },
      { repository, completion: unconfiguredCompletion() },
    );

    expect(result).toEqual({ error: "not_found" });

    const guestBAttempt = await repository.findLatestByProblem(
      PROBLEM_ID,
      "guest-B",
    );

    expect(guestBAttempt).toBeNull();

    const guestAAttempt = await repository.findById(
      first.id,
      "guest-A",
    );

    expect(guestAAttempt).not.toBeNull();
    expect(guestAAttempt!.answerHistory).toHaveLength(1);
  });
});
