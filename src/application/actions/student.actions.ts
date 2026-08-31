"use server";

import { z } from "zod";

import { gradeStudentQuizUseCase } from "@/application/use-cases/student/grade-quiz";
import type { StudentQuizGrade } from "@/domain/student";

const payloadSchema = z.object({
  quizId: z.string().min(1).max(80),
  answers: z.record(z.string().max(8)),
});

export async function gradeStudentQuizAction(input: {
  quizId: string;
  answers: Record<string, string>;
}): Promise<StudentQuizGrade | { error: string }> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }
  const result = gradeStudentQuizUseCase(parsed.data.quizId, parsed.data.answers);
  if ("error" in result) {
    return { error: "not_found" };
  }
  return result;
}
