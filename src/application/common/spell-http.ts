import { NextResponse } from "next/server";
import type { z } from "zod";

import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import type { SpellRuntime } from "@/infrastructure/spell/spell-runtime";
import { getSpellRuntime } from "@/infrastructure/spell/spell-runtime";
import type { SignedRequest } from "@/application/use-cases/spell/authenticate-installation-request";
import { DomainError, ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import { SpellActiveActivationConflictError } from "@/domain/repositories/spell-activation-repository";
import { SpellError, spellErrors } from "@/domain/spell/errors";
import { getAppUrl } from "@/lib/app-url";
import { consumeRateLimit } from "@/infrastructure/security/rate-limiter";

export const SPELL_MAX_BODY_BYTES = 16 * 1024;

export { getSpellRuntime, requireActor };
export type { SpellRuntime };

/** Never cache anything Spell returns: tokens, codes and state are per-caller. */
const NO_STORE = { "Cache-Control": "no-store" };

export function spellJson(body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, { status: init?.status ?? 200, headers: NO_STORE });
}

/** Read the body once, bounded, keeping the exact bytes that were signed. */
export async function readBoundedBody(request: Request): Promise<{
  rawBody: string;
  json: unknown;
}> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > SPELL_MAX_BODY_BYTES) {
    throw new ValidationError("Request body is too large");
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > SPELL_MAX_BODY_BYTES) {
    throw new ValidationError("Request body is too large");
  }
  if (!rawBody) return { rawBody, json: {} };
  try {
    return { rawBody, json: JSON.parse(rawBody) };
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export function hashedClientIp(request: Request, runtime: SpellRuntime): string | null {
  const ip = clientIp(request);
  return ip ? runtime.deps.vault.hashIdentifier("client-ip", ip) : null;
}

export function toSignedRequest(
  request: Request,
  rawBody: string,
  ipHash: string | null,
): SignedRequest {
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    rawBody,
    headers: {
      installation: request.headers.get("x-spell-installation"),
      timestamp: request.headers.get("x-spell-timestamp"),
      nonce: request.headers.get("x-spell-nonce"),
      signature: request.headers.get("x-spell-signature"),
    },
    ipHash,
  };
}

/** Best-effort throttle in front of the authoritative DB-backed counters. */
export async function throttle(
  key: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const rate = await consumeRateLimit(key, limit, windowMs);
  return rate.ok ? null : rateLimitHttpResponse(rate.retryAfterSeconds);
}

/**
 * CSRF guard for cookie-authenticated, state-changing browser routes. Browsers
 * always send Origin on cross-site POSTs; non-browser clients may omit it.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let expected: string;
  try {
    expected = new URL(getAppUrl()).origin;
  } catch {
    expected = new URL(request.url).origin;
  }
  if (origin !== expected) throw new ForbiddenError();
}

export function spellErrorResponse(error: unknown): NextResponse {
  // Retries exhausted under contention (state rolled back): client may retry.
  if (error instanceof SpellActiveActivationConflictError) {
    return spellErrorResponse(spellErrors.activationConflict());
  }
  if (error instanceof SpellError) {
    const headers: Record<string, string> = { ...NO_STORE };
    const retryAfter = error.details?.retryAfterSeconds;
    if (error.statusCode === 429 && typeof retryAfter === "number") {
      headers["Retry-After"] = String(retryAfter);
    }
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.details ?? {}) },
      { status: error.statusCode, headers },
    );
  }
  if (error instanceof DomainError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode, headers: NO_STORE },
    );
  }
  // Log the class only: Spell errors can sit next to secrets in stack frames.
  console.error("[spell] unexpected error:", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: "Internal error", code: "INTERNAL" },
    { status: 500, headers: NO_STORE },
  );
}

export function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError("Invalid request");
  return result.data;
}
