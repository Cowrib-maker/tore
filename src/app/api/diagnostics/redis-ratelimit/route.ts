import { getRedisClient } from "@/infrastructure/security/redis-client";
import {
  consumeRateLimit,
  RATE_LIMIT_SCRIPT_SHA,
} from "@/infrastructure/security/rate-limiter";
import {
  acquireDiagnosticsMarker,
  DIAG_TOKEN_HEADER,
  isDiagnosticsEnvironment,
  isWellFormedToken,
  readConfiguredToken,
  redisUrlScheme,
  runRedisRateLimitDiagnostics,
  tokensMatch,
  type DiagCode,
  type DiagRedis,
  type DiagReport,
} from "@/infrastructure/security/redis-ratelimit-diagnostics";

/**
 * TEMPORARY Preview-only Redis rate-limit diagnostics (PR #18 EVAL gate).
 * Remove this route after the Preview check.
 *
 * Every refusal is the same empty 404 with Cache-Control: no-store, whatever
 * the reason (wrong environment, method, missing/malformed/wrong token, or a
 * token that was already used). Every HTTP method is exported explicitly so
 * Next.js never answers with 405 or an automatic OPTIONS response.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

function emptyNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonReport(report: DiagReport): Response {
  return new Response(JSON.stringify(report), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function failure(code: DiagCode): Response {
  return jsonReport({ ok: false, gate: "FAILED", code, steps: [] });
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isDiagnosticsEnvironment(process.env)) {
      return emptyNotFound();
    }
    const expected = readConfiguredToken(process.env);
    if (!expected) {
      return emptyNotFound();
    }
    const provided = request.headers.get(DIAG_TOKEN_HEADER);
    if (!isWellFormedToken(provided) || !tokensMatch(provided, expected)) {
      return emptyNotFound();
    }

    const url = process.env.REDIS_URL;
    if (!url) {
      return failure("REDIS_NOT_CONFIGURED");
    }
    if (redisUrlScheme(url) !== "rediss:") {
      return failure("REDIS_SCHEME_NOT_TLS");
    }
    const client = getRedisClient();
    if (!client) {
      return failure("REDIS_NOT_CONFIGURED");
    }
    const redis = client as unknown as DiagRedis;

    const marker = await acquireDiagnosticsMarker(redis, provided);
    if (marker === "USED") {
      return emptyNotFound();
    }
    if (marker === "UNAVAILABLE") {
      return failure("REDIS_UNAVAILABLE");
    }

    const report = await runRedisRateLimitDiagnostics({
      redis,
      consume: consumeRateLimit,
      scriptSha: RATE_LIMIT_SCRIPT_SHA,
    });
    const failed = report.steps.filter((step) => step.status === "FAIL").length;
    console.info(
      JSON.stringify({
        scope: "redis-diag",
        gate: report.gate,
        passed: report.steps.filter((step) => step.status === "PASS").length,
        failed,
      }),
    );
    return jsonReport(report);
  } catch {
    return failure("INTERNAL");
  }
}

export async function GET(): Promise<Response> {
  return emptyNotFound();
}

export async function HEAD(): Promise<Response> {
  return emptyNotFound();
}

export async function OPTIONS(): Promise<Response> {
  return emptyNotFound();
}

export async function PUT(): Promise<Response> {
  return emptyNotFound();
}

export async function PATCH(): Promise<Response> {
  return emptyNotFound();
}

export async function DELETE(): Promise<Response> {
  return emptyNotFound();
}
