import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import { guardLawyerAiHttp } from "@/application/common/guard-lawyer-ai-http";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { lookupAuthSession } from "@/application/common/session";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { resolveGuestSession } from "@/application/legal-ai/resolve-guest-session";
import { assertOwnedCaseFileForAi } from "@/application/use-cases/case-review";
import {
  DomainError,
  SessionReplacedError,
} from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { GUEST_SESSION_COOKIE } from "@/infrastructure/legal-ai/guest-session-cookie";
import {
  consumeRateLimit,
  LEGAL_AI_CHAT_RATE_LIMIT,
  legalAiChatRateLimitKey,
} from "@/infrastructure/security/rate-limiter";
import { encodeSseEvent } from "@/infrastructure/http/sse";

type ChatRequest = {
  message?: string;
  conversationId?: string;
  caseFileId?: string;
  /** Ignored. Capability is derived from the authenticated role. */
  mode?: "CITIZEN" | "PROFESSIONAL" | "LAWYER";
};

function errorResponseFor(error: unknown): Response {
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
    const status = error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  console.error("TORE Legal AI error:", error);
  return NextResponse.json(
    { error: "AI үйлчилгээтэй холбогдоход алдаа гарлаа." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  // Every check up to (and including) parsing the request body is identical
  // to the previous non-streaming handler and still returns the exact same
  // JSON error shapes on failure — only the actual Legal AI turn, once we
  // know the request is authenticated/authorized/rate-limited/well-formed,
  // becomes a stream instead of a single JSON body.
  try {
    const lookup = await lookupAuthSession();
    if (lookup.replaced) {
      throw new SessionReplacedError();
    }
    const session = lookup.session;
    const actor = session?.user?.id
      ? await requireActor().catch((error) => {
          if (error instanceof SessionReplacedError) throw error;
          return null;
        })
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

    // Ties the provider-facing AbortSignal to the incoming request's own
    // signal (fires on client disconnect / browser navigating away) AND to
    // the stream's cancel() callback (fires when the reader — our own
    // ReadableStream consumer inside Next.js — stops pulling, e.g. because
    // the client called AbortController.abort() on its fetch). Either path
    // cancels the same underlying LLM call instead of letting it run to
    // completion unobserved.
    const abortController = new AbortController();
    const onRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onRequestAbort);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const enqueue = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
          } catch {
            // Controller already closed (e.g. client gone) — ignore.
          }
        };

        try {
          const result = await getLegalAiService().createTurn({
            userId: actor?.userId,
            guestSessionId: actor ? undefined : guest?.id,
            actorRole: actor?.role,
            message: body.message ?? "",
            conversationId: body.conversationId,
            caseFileId,
            userContext: actor ? { role: actor.role } : undefined,
            signal: abortController.signal,
            onDelta: (delta) => enqueue("delta", { text: delta }),
          });

          enqueue("done", {
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
          if (error instanceof LegalAiError && error.code === "AI_ABORTED") {
            // Client already knows it cancelled (it caused the abort) —
            // nothing to tell it, and no error worth logging.
          } else if (!abortController.signal.aborted) {
            const errorResponse = errorResponseFor(error);
            let payload: unknown = { error: "AI үйлчилгээтэй холбогдоход алдаа гарлаа." };
            try {
              payload = await errorResponse.json();
            } catch {
              // Fall back to the generic payload above.
            }
            enqueue("error", { ...(payload as object), status: errorResponse.status });
          }
        } finally {
          request.signal.removeEventListener("abort", onRequestAbort);
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        }
      },
      cancel() {
        abortController.abort();
      },
    });

    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (!actor && guest?.cookieValue) {
      headers.append(
        "Set-Cookie",
        guestSessionCookieHeader(guest.cookieValue, guest.expiresAt),
      );
    }

    return new Response(stream, { status: 200, headers });
  } catch (error) {
    return errorResponseFor(error);
  }
}

function guestSessionCookieHeader(value: string, expires: Date): string {
  const parts = [
    `${GUEST_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expires.toUTCString()}`,
  ];
  return parts.join("; ");
}
