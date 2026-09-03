"use server";

import { z } from "zod";

import {
  guardLawyerAiHttp,
  recordLawyerFeatureUsage,
} from "@/application/common/guard-lawyer-ai-http";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { gradeStudentQuizUseCase } from "@/application/use-cases/student/grade-quiz";
import {
  evaluateStudentProblemUseCase,
  gradeStudentProblemUseCase,
} from "@/application/use-cases/student/grade-problem";
import { authorizeStudentProblemEvaluation } from "@/application/use-cases/student/authorize-problem-evaluation";
import { createStudentProblemCompletion } from "@/application/use-cases/student/create-problem-evaluator";
import {
  assertCitizenAiOperation,
  recordCitizenFeatureUsage,
} from "@/application/use-cases/entitlements/assert-citizen-ai-operation";
import { recordStudentProblemAiTokenUsage } from "@/application/use-cases/student/evaluate-problem";
import { createLegalQuestionAccess } from "@/application/legal-ai/legal-question-access";
import type { StudentQuizGrade } from "@/domain/student";
import { EntitlementFeature } from "@/domain/enums";
import {
  entitlementUsageRepository,
  subscriptionRepository,
  userRepository,
} from "@/infrastructure/repositories";
import {
  prismaConversationBillingStore,
  prismaGuestSessionStore,
} from "@/infrastructure/legal-ai/prisma-guest-session-store";
import { LEGAL_AI_CHAT_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

const payloadSchema = z.object({
  quizId: z.string().min(1).max(80),
  answers: z.record(z.string().max(200)),
});

const problemPayloadSchema = z.object({
  problemId: z.string().min(1).max(80),
  answer: z.string().trim().min(80).max(12_000),
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

export async function gradeStudentProblemAction(input: {
  problemId: string;
  answer: string;
}) {
  const parsed = problemPayloadSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };

  const structural = gradeStudentProblemUseCase(
    parsed.data.problemId,
    parsed.data.answer,
  );
  if ("error" in structural) return structural;

  const completion = createStudentProblemCompletion();
  if (!completion.isConfigured()) return structural;

  const authorization = await authorizeStudentProblemEvaluation({
    requireActor,
    requireVerifiedEmail: assertEmailVerified,
    isRateLimited: async (userId) =>
      Boolean(
        await enforceRateLimit(
          `student:problem-ai:${userId}`,
          LEGAL_AI_CHAT_RATE_LIMIT,
        ),
      ),
    authorizePaidCitizen: (actor) =>
      assertCitizenAiOperation(actor, EntitlementFeature.LEGAL_AI_QUERY, {
        subscriptionRepository,
        entitlementUsageRepository,
        userRepository,
      }),
    authorizePaidLawyer: (actor) =>
      guardLawyerAiHttp(actor, EntitlementFeature.LEGAL_AI_QUERY),
    consumeCitizen: (usageId) =>
      recordCitizenFeatureUsage(usageId, EntitlementFeature.LEGAL_AI_QUERY, {
        entitlementUsageRepository,
      }),
    consumeLawyer: (usageId) =>
      recordLawyerFeatureUsage(usageId, EntitlementFeature.LEGAL_AI_QUERY),
  });
  if (!authorization.allowed) {
    return {
      ...structural,
      evaluation: {
        ...structural.evaluation,
        label: authorization.message,
      },
    };
  }

  const evaluated = await evaluateStudentProblemUseCase(
    parsed.data.problemId,
    parsed.data.answer,
    completion,
  );
  if ("error" in evaluated) return evaluated;
  if (evaluated.evaluation.mode === "ai" && evaluated.aiUsage) {
    try {
      await recordStudentProblemAiTokenUsage({
        access: createLegalQuestionAccess({
          guestSessions: prismaGuestSessionStore,
          conversations: prismaConversationBillingStore,
          subscriptionRepository,
          entitlementUsageRepository,
          userRepository,
        }),
        subject: {
          kind: "user",
          userId: authorization.actor.userId,
          role: authorization.actor.role,
        },
        usage: evaluated.aiUsage,
      });
      await authorization.consume();
    } catch {
      return {
        ...structural,
        evaluation: {
          ...structural.evaluation,
          label: "AI үнэлгээний эрхийн тооцоолол одоогоор боломжгүй — бүтцийн шалгалт",
        },
      };
    }
  }
  return {
    problemId: evaluated.problemId,
    total: evaluated.total,
    rubric: evaluated.rubric,
    needsSourceVerification: evaluated.needsSourceVerification,
    feedback: evaluated.feedback,
    evaluation: evaluated.evaluation,
  };
}
