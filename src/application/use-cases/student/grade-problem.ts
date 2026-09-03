import { getStudentProblem, gradeStudentProblem } from "@/domain/student";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import { evaluateStudentProblemWithUsage } from "./evaluate-problem";

function findProblem(problemId: string) {
  const trackId = problemId.replace(/-problem$/, "");
  if (!["criminal", "civil", "administrative"].includes(trackId)) {
    return null;
  }
  const problem = getStudentProblem(
    trackId as "criminal" | "civil" | "administrative",
  );
  return problem.id === problemId ? problem : null;
}

export function gradeStudentProblemUseCase(problemId: string, answer: string) {
  const problem = findProblem(problemId);
  return problem ? gradeStudentProblem(problem, answer) : { error: "not_found" as const };
}

export async function evaluateStudentProblemUseCase(
  problemId: string,
  answer: string,
  completion: LegalAiCompletionPort,
) {
  const problem = findProblem(problemId);
  if (!problem) return { error: "not_found" as const };
  const grade = gradeStudentProblem(problem, answer);
  const evaluated = await evaluateStudentProblemWithUsage(
    { problem, grade, answer },
    completion,
  );
  return {
    ...grade,
    evaluation: evaluated.evaluation,
    aiUsage: evaluated.usage,
  };
}
