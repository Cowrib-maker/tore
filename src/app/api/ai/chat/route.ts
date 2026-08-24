import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import { guardLawyerAiHttp } from "@/application/common/guard-lawyer-ai-http";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { getSessionUser } from "@/application/common/session";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { resolveGuestSession } from "@/application/legal-ai/resolve-guest-session";
import { assertOwnedCaseFileForAi } from "@/application/use-cases/case-review";
import { DomainError } from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { GUEST_SESSION_COOKIE } from "@/infrastructure/legal-ai/guest-session-cookie";
import {
  consumeRateLimit,
  LEGAL_AI_CHAT_RATE_LIMIT,
  legalAiChatRateLimitKey,
} from "@/infrastructure/security/rate-limiter";

type ChatRequest = {
  message?: string;
  conversationId?: string;
  caseFileId?: string;
  mode?: "CITIZEN" | "PROFESSIONAL";
};

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    const actor = session?.user?.id
      ? await requireActor().catch(() => null)
      : null;

    if (actor?.role === UserRole.LAWYER) {
      await assertEmailVerified(actor.userId);
      await guardLawyerAiHttp(actor, EntitlementFeature.LEGAL_AI_QUERY, {
        checkQuota: false,
      });
    }

    const guest = actor
      ? await resolveGuestSession({
          claimForUserId: actor.userId,
          createIfMissing: false,
        })
      : await resolveGuestSession();

    if (!actor && !guest) {
      throw new EntitlementError(
        "Зочны сесс олдсонгүй. Хуудсаа дахин ачаална уу.",
        "AUTHENTICATION_REQUIRED",
        401,
      );
    }

    const rateKey = actor?.userId ?? `guest:${guest!.id}`;
    const rate = await consumeRateLimit(
      legalAiChatRateLimitKey(rateKey),
      LEGAL_AI_CHAT_RATE_LIMIT.limit,
      LEGAL_AI_CHAT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const body = (await request.json()) as ChatRequest;
    const requestedCaseFileId =
      typeof body.caseFileId === "string" ? body.caseFileId.trim() : "";
    // Citizens/guests never attach a case. Lawyers must own the CaseFile.
    const caseFileId =
      actor?.role === UserRole.LAWYER && requestedCaseFileId && !body.conversationId
        ? requestedCaseFileId
        : undefined;
    if (caseFileId && actor) {
      await assertOwnedCaseFileForAi(actor, caseFileId);
    }

    const result = await getLegalAiService().createTurn({
      userId: actor?.userId,
      guestSessionId: actor ? undefined : guest?.id,
      actorRole: actor?.role,
      message: body.message ?? "",
      conversationId: body.conversationId,
      caseFileId,
      userContext: actor ? { role: actor.role } : undefined,
      mode: caseFileId ? "PROFESSIONAL" : body.mode,
    });

    const response = NextResponse.json({
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

    if (!actor && guest?.cookieValue) {
      response.cookies.set(GUEST_SESSION_COOKIE, guest.cookieValue, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: guest.expiresAt,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof EntitlementError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
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
