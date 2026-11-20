/**
 * Orchestrates the written-exam pipeline end to end for one submission:
 *
 *   student answer -> AiFactElementMapper -> FactElementMapping[]
 *   -> DefaultSubsumptionEngine (unmodified) -> per-element result
 *   -> AI Legal Tutor narrative -> StudentAttempt (append-only revision)
 *
 * Never overwrites a prior answer: every call appends one AttemptRevision
 * via `StudentAttemptRepository.appendRevision` — see req #6.
 */
import { AiFactElementMapper } from "@/application/ai/ai-fact-element-mapper";
import { createStudentProblemEvaluator } from "@/application/ai/student-problem-evaluator";
import { evaluateWithTutor } from "@/application/ai/legal-tutor-evaluator";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import { DefaultSubsumptionEngine } from "@/engine/doctrine";
import type { FactMappingInput, IFactElementMapper, LegalEvidence, LegalFact } from "@/engine/doctrine";
import { findWrittenExamProblemById } from "@/domain/student/written-exam-problems";
import { maxWrittenExamRubricTotal } from "@/domain/student/rubric-from-legal-test";
import type { AttemptRevision, WrittenExamAttempt } from "@/domain/student/written-exam-types";
import type { StudentAttemptRepository } from "@/domain/repositories/student-attempt-repository";
import { studentAttemptRepository } from "@/infrastructure/repositories";
import {
  WRITTEN_EXAM_ANSWER_MAX_CHARS,
  WRITTEN_EXAM_ANSWER_MIN_CHARS,
} from "@/domain/student/written-exam-validation";

export type SubmitWrittenAttemptError = "not_found" | "too_short" | "too_long";

export type PrefetchingFactMapper = IFactElementMapper & {
  prefetch(input: FactMappingInput): Promise<void>;
};

export type SubmitWrittenAttemptDeps = {
  repository?: StudentAttemptRepository;
  mapper?: PrefetchingFactMapper;
  completion?: LegalAiCompletionPort;
};

export async function submitWrittenAttemptUseCase(
  input: { problemId: string; answer: string; attemptId?: string; guestSessionId: string },
  deps: SubmitWrittenAttemptDeps = {},
): Promise<WrittenExamAttempt | { error: SubmitWrittenAttemptError }> {
  const problem = findWrittenExamProblemById(input.problemId.trim());
  if (!problem) {
    return { error: "not_found" };
  }

  const answer = input.answer.trim();
  if (answer.length < WRITTEN_EXAM_ANSWER_MIN_CHARS) {
    return { error: "too_short" };
  }
  if (answer.length > WRITTEN_EXAM_ANSWER_MAX_CHARS) {
    return { error: "too_long" };
  }

  const repository = deps.repository ?? studentAttemptRepository;
  const completion = deps.completion ?? createStudentProblemEvaluator();

  
    const attempt = input.attemptId
  ? await repository.findById(input.attemptId, input.guestSessionId)
  : await repository.findLatestByProblem(problem.id, input.guestSessionId);

// A supplied attemptId must belong to the current guest session.
if (input.attemptId && !attempt) {
  return { error: "not_found" };
}

// An attempt for a different problem cannot be reused.
if (attempt && attempt.problemId !== problem.id) {
  return { error: "not_found" };
}

const resolvedAttempt =
  attempt ??
  (await repository.create({
    problemId: problem.id,
    trackId: problem.trackId,
    guestSessionId: input.guestSessionId,
  }));

  const applicableAt = new Date().toISOString().slice(0, 10);
  const studentFact: LegalFact = {
    id: "student-answer",
    statement: answer,
    elementId: null,
    disputed: false,
  };
  // The kernel's evaluateElementMappings requires a linked evidence id
  // before any SUPPORTS mapping can reach SATISFIED (evidence proves the
  // fact, not the element — unmodified rule). A written exam has no
  // discrete exhibits like structured case intake does, so the student's
  // own answer text stands as its own evidence, one item covering the
  // whole passage — never invented, never separate from what they wrote.
  const studentEvidence: LegalEvidence = {
    id: "student-answer:self",
    factId: studentFact.id,
    description: answer,
    sourceId: null,
  };
  const mappingInput = {
    facts: [studentFact],
    elements: problem.legalTest.elements,
    evidence: [studentEvidence],
    applicableAt,
  };

  const mapper = deps.mapper ?? new AiFactElementMapper(completion);
  await mapper.prefetch(mappingInput);
  const mapping = mapper.map(mappingInput);

  const subsumptionEngine = new DefaultSubsumptionEngine();
  const subsumption = subsumptionEngine.apply({
    legalTest: problem.legalTest,
    facts: [studentFact],
    evidence: [studentEvidence],
    mappings: mapping.mappings,
  });

  const evaluation = await evaluateWithTutor({
    answer,
    problemTitle: problem.title,
    rubric: problem.rubric,
    applications: subsumption.applications,
    completion,
  });

  const revision: AttemptRevision = {
    answer,
    submittedAt: new Date().toISOString(),
    evaluation,
  };

  const maxTotal = maxWrittenExamRubricTotal(problem.rubric);
  const satisfiedWeight = problem.rubric
    .filter((item) =>
      evaluation.elementFeedback.some((f) => f.elementId === item.elementId && f.status === "SATISFIED"),
    )
    .reduce((sum, item) => sum + item.weight, 0);
  const finalGrade = subsumption.allRequiredSatisfied
    ? { total: satisfiedWeight, maxTotal, percent: maxTotal > 0 ? Math.round((satisfiedWeight / maxTotal) * 100) : 0 }
    : null;

  return repository.appendRevision({
  id: resolvedAttempt.id,
  guestSessionId: input.guestSessionId,
  revision,
  status: subsumption.allRequiredSatisfied ? "graded" : "in_progress",
  finalGrade,
});
}
