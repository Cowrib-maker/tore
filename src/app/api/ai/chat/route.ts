import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import { guardLawyerAiHttp, recordLawyerFeatureUsage } from "@/application/common/guard-lawyer-ai-http";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { DomainError } from "@/domain/errors/domain-error";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import {
  consumeRateLimit,
  LEGAL_AI_CHAT_RATE_LIMIT,
  legalAiChatRateLimitKey,
} from "@/infrastructure/security/rate-limiter";

type ChatRequest = {
  message?: string;
  conversationId?: string;
  mode?: "CITIZEN" | "PROFESSIONAL";
};

export async function POST(request: Request) {
  try {
    const actor = await requireActor();

    if (actor.role === UserRole.LAWYER) {
      await assertEmailVerified(actor.userId);
    }

    const rate = await consumeRateLimit(
      legalAiChatRateLimitKey(actor.userId),
      LEGAL_AI_CHAT_RATE_LIMIT.limit,
      LEGAL_AI_CHAT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    let usageId: string | undefined;

    if (actor.role === UserRole.LAWYER) {
      const guard = await guardLawyerAiHttp(
        actor,
        EntitlementFeature.LEGAL_AI_QUERY,
      );
      usageId = guard.usageId;
    }

    const body = (await request.json()) as ChatRequest;
    const result = await getLegalAiService().createTurn({
      userId: actor.userId,
      message: body.message ?? "",
      conversationId: body.conversationId,
      userContext: {
        role: actor.role,
      },
      mode: body.mode,
    });

    if (usageId) {
      await recordLawyerFeatureUsage(usageId, EntitlementFeature.LEGAL_AI_QUERY, {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    }

    return NextResponse.json({
      conversationId: result.conversationId,
      message: {
        id: result.message.id,
        role: result.message.role,
        content: result.message.content,
        citations: (result.message.citations ?? []).map((citation) => ({
          id: citation.id,
          sourceType: citation.sourceType,
          title: citation.title,
          article: citation.article,
          paragraph: citation.paragraph,
          sourceUrl: citation.sourceUrl,
          sourceVersion: citation.sourceVersion,
          validFrom: citation.validFrom,
          validTo: citation.validTo,
        })),
      },
    });
  } catch (error) {
    if (error instanceof LegalAiError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        },
        { status: error.statusCode },
      );
    }
    if (error instanceof DomainError) {
      const status =
        error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }

    console.error("TORE Legal AI error:", error);

    return NextResponse.json(
      {
        error: "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      },
      { status: 500 },
    );
  }
}
