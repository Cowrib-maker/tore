import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { guardLawyerAiHttp } from "@/application/common/guard-lawyer-ai-http";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { researchMatterForActor } from "@/application/use-cases/matters/research-matter";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import {
  consumeRateLimit,
  LEGAL_AI_CHAT_RATE_LIMIT,
  legalAiChatRateLimitKey,
} from "@/infrastructure/security/rate-limiter";

/**
 * Matter Legal Research V1. Any authenticated role may research a Matter it
 * owns (Matter has no role restriction, same as the rest of Matter V1/M2).
 * Entitlement reservation/consumption happens inside
 * LegalAiService.createTurn (via researchMatterForActor), exactly the same
 * code path and same one-question cost as a normal Legal AI turn — this
 * route adds no separate entitlement logic of its own, so a research
 * question can never double-consume. The lawyer-only subscription-validity
 * check (no quota mutation: checkQuota:false) mirrors /api/ai/chat's own
 * pre-check for LAWYER actors exactly.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ matterId: string }> },
) {
  try {
    const { matterId } = await context.params;
    const actor = await requireActor();

    if (actor.role === UserRole.LAWYER) {
      await assertEmailVerified(actor.userId);
      await guardLawyerAiHttp(actor, EntitlementFeature.LEGAL_AI_QUERY, {
        checkQuota: false,
      });
    }

    const rate = await consumeRateLimit(
      legalAiChatRateLimitKey(actor.userId),
      LEGAL_AI_CHAT_RATE_LIMIT.limit,
      LEGAL_AI_CHAT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const body = (await request.json().catch(() => null)) as
      | { question?: unknown }
      | null;
    const question = typeof body?.question === "string" ? body.question : "";

    const result = await researchMatterForActor(actor, matterId, question);

    return NextResponse.json(
      {
        conversationId: result.conversationId,
        content: result.content,
        citations: result.citations,
      },
      { status: 200 },
    );
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

    console.error("TORE Matter research error:", error);
    return NextResponse.json(
      { error: "Судалгаа хийхэд алдаа гарлаа." },
      { status: 500 },
    );
  }
}
