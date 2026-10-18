import { NextResponse } from "next/server";

import { getLegalResearchAgent } from "@/application/legal-research-agent/create-legal-research-agent";
import { guardLawyerAiHttp } from "@/application/common/guard-lawyer-ai-http";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { readJsonBody } from "@/application/common/read-json-body";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { isLegalResearchAgentV1Enabled } from "@/lib/feature-flags";
import {
  consumeRateLimit,
  LEGAL_AI_CHAT_RATE_LIMIT,
  legalAiChatRateLimitKey,
} from "@/infrastructure/security/rate-limiter";

/**
 * Legal Research Agent (read-only; retrieval + citation verification; no model call). Behind TORE_LEGAL_RESEARCH_AGENT_V1.
 * Authenticated users only (no guests). Same pre-checks as /api/ai/chat: verified email and a valid subscription for lawyers
 * (checkQuota:false) and the same per-user rate limit. It consumes no Legal AI question entitlement because it produces no AI answer.
 */
export async function POST(request: Request) {
  if (!isLegalResearchAgentV1Enabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const actor = await requireActor();
    if (actor.role === UserRole.LAWYER) {
      await assertEmailVerified(actor.userId);
      await guardLawyerAiHttp(actor, EntitlementFeature.LEGAL_AI_QUERY, { checkQuota: false });
    }

    const rate = await consumeRateLimit(
      legalAiChatRateLimitKey(actor.userId),
      LEGAL_AI_CHAT_RATE_LIMIT.limit,
      LEGAL_AI_CHAT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const body = await readJsonBody(request);
    const result = await getLegalResearchAgent().run({
      question: body.question as string,
      signal: request.signal,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("TORE Legal Research Agent error:", error);
    return NextResponse.json({ error: "Судалгааны үйлчилгээнд алдаа гарлаа." }, { status: 500 });
  }
}
