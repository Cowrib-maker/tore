import { z } from "zod";

import type {
  LegalAiCompletionPort,
} from "@/application/ai/legal-ai.types";
import type {
  LegalQuestionAccessPort,
  LegalQuestionSubject,
} from "@/application/legal-ai/legal-question-access";
import { createFallbackProblemEvaluation } from "@/domain/student/grade-problem";
import type {
  StudentLegalProblem,
  StudentProblemEvaluation,
  StudentProblemGrade,
} from "@/domain/student";

const responseSchema = z.object({
  strengths: z.array(z.string().trim().min(1).max(500)).max(4),
  weaknesses: z.array(z.string().trim().min(1).max(500)).max(4),
  missingIssues: z.array(z.string().trim().min(1).max(500)).max(4),
  missingProvisions: z.array(z.string().trim().min(1).max(500)).max(4),
  suggestions: z.array(z.string().trim().min(1).max(500)).max(5),
});

const articleReferencePattern =
  /\b(?:\d+(?:\.\d+){0,2}\s*(?:дугаар\s*)?зүйл|зүйл\s*\d+|article\s*\d+|§\s*\d+)/i;

function fallback(
  problem: StudentLegalProblem,
  grade: StudentProblemGrade,
): StudentProblemEvaluation {
  return createFallbackProblemEvaluation({
    problem,
    rubric: grade.rubric,
    needsSourceVerification: grade.needsSourceVerification,
  });
}

export type StudentProblemAiUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type StudentProblemEvaluationResult = {
  evaluation: StudentProblemEvaluation;
  usage: StudentProblemAiUsage | null;
};

function evaluatorPrompt(problem: StudentLegalProblem): string {
  const sources = problem.sources
    .map((source) => `- ${source.title} (${source.url})`)
    .join("\n");

  return `Та Монголын эрх зүйн оюутны кейс бодлогын хариултад сургалтын чиглүүлэх үнэлгээ хийнэ.
Зөвхөн доорх кейсийн баримт болон эх сурвалжийн нэр, URL-д тулгуурла. Эх сурвалжийн агуулга өгөөгүй тул хуулийн зүйл, заалт, дугаар, агуулгыг ОГТ бүү зохиож, бүү таамагла. Хариултад байгаа дугаарыг зөв гэж бүү батал.
“missingProvisions” талбарт зөвхөн эх сурвалжийн яг нэрийг ашиглан “...-ийн холбогдох зохицуулалтыг эхээс нягтлах” маягийн шалгах саналыг бич; зүйл, заалт, дугаар бүү бич.
Энэ нь хууль зүйн зөвлөгөө биш. Баримт дутуу бол таамаглахын оронд дутууг хэл.
Зөвхөн дараах JSON-ыг Монгол хэлээр буцаа:
{"strengths":["..."],"weaknesses":["..."],"missingIssues":["..."],"missingProvisions":["..."],"suggestions":["..."]}

Кейс:
${problem.factPattern}

Даалгавар:
${problem.prompt}

Нягтлах боломжтой албан ёсны эх:
${sources}`;
}

function parseAiEvaluation(
  content: string,
  problem: StudentLegalProblem,
): z.infer<typeof responseSchema> | null {
  const json = content.trim().replace(/^```json\s*|\s*```$/gi, "");
  const parsed = responseSchema.safeParse(
    (() => {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) return null;

  const entries = Object.values(parsed.data).flat();
  if (entries.some((entry) => articleReferencePattern.test(entry))) return null;

  const sourceNames = problem.sources.map((source) => source.title);
  if (
    parsed.data.missingProvisions.some(
      (entry) => !sourceNames.some((sourceName) => entry.includes(sourceName)),
    )
  ) {
    return null;
  }
  return parsed.data;
}

/**
 * Uses the shared completion port without invoking chat entitlement or storing a
 * conversation. Invalid, unavailable, or ungrounded output falls back safely.
 */
export async function evaluateStudentProblem(
  input: {
    problem: StudentLegalProblem;
    grade: StudentProblemGrade;
    answer: string;
  },
  completion: LegalAiCompletionPort,
): Promise<StudentProblemEvaluation> {
  return (await evaluateStudentProblemWithUsage(input, completion)).evaluation;
}

export async function evaluateStudentProblemWithUsage(
  input: {
    problem: StudentLegalProblem;
    grade: StudentProblemGrade;
    answer: string;
  },
  completion: LegalAiCompletionPort,
): Promise<StudentProblemEvaluationResult> {
  if (!completion.isConfigured() || input.problem.sources.length === 0) {
    return { evaluation: fallback(input.problem, input.grade), usage: null };
  }

  try {
    const result = await completion.complete({
      systemPrompt: evaluatorPrompt(input.problem),
      messages: [{ role: "user", content: input.answer }],
    });
    const parsed = parseAiEvaluation(result.content, input.problem);
    if (!parsed) {
      return { evaluation: fallback(input.problem, input.grade), usage: null };
    }

    return {
      evaluation: {
        mode: "ai",
        label: "AI-ийн сургалтын үнэлгээ",
        ...parsed,
        sourceIntegrityNote: input.grade.needsSourceVerification
          ? "Таны оруулсан зүйл, заалтын дугаар баталгаажаагүй. Албан ёсны эхээс гараар нягтална уу."
          : "AI нь зөвхөн жагсаасан албан ёсны эхийн нэрийг ашигласан; зүйл, заалтын дугаар дурдаагүй.",
        model: result.model,
      },
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  } catch {
    return { evaluation: fallback(input.problem, input.grade), usage: null };
  }
}

/**
 * Delegates token ceilings and atomic accounting to the same Legal AI access
 * port used by paid product flows. Call this only for accepted AI output.
 */
export async function recordStudentProblemAiTokenUsage(input: {
  access: LegalQuestionAccessPort;
  subject: LegalQuestionSubject;
  usage: StudentProblemAiUsage;
}): Promise<void> {
  if (!input.access.recordTokenUsage) {
    throw new Error("Legal AI token accounting is unavailable");
  }
  await input.access.recordTokenUsage(input.subject, input.usage);
}
