import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVALID_JSON_BODY_MESSAGE, readJsonBody } from "@/application/common/read-json-body";
import { DomainError, UnauthorizedError } from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";

/**
 * A request body that is not valid JSON (or not a JSON object) is a CLIENT error: the API routes must answer a controlled 400 with
 * code VALIDATION_ERROR instead of an uncaught SyntaxError/TypeError → generic 500 + a logged stack trace.
 * Authentication, authorization and rate limits still run BEFORE the body is read, exactly as before.
 */

const jsonRequest = (raw: string) => new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: raw });

const BAD_BODIES: Array<[string, string]> = [
  ["truncated JSON", '{"message": "асуулт'],
  ["not JSON at all", "message=hello"],
  ["an empty body", ""],
  ["JSON null", "null"],
  ["a JSON array", '["a"]'],
  ["a JSON string", '"hello"'],
  ["a JSON number", "123"],
  ["a JSON boolean", "true"],
];

describe("readJsonBody", () => {
  it("returns a JSON object body unchanged", async () => {
    await expect(readJsonBody(jsonRequest('{"a":1,"b":"x","c":[1]}'))).resolves.toEqual({ a: 1, b: "x", c: [1] });
    await expect(readJsonBody(jsonRequest("{}"))).resolves.toEqual({});
  });

  it.each(BAD_BODIES)("rejects %s with a 400 VALIDATION_ERROR DomainError (never a raw SyntaxError)", async (_label, raw) => {
    const error = await readJsonBody(jsonRequest(raw)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400, message: INVALID_JSON_BODY_MESSAGE });
  });

  it("keeps request.json()'s contract: the Content-Type header is ignored, Cyrillic text round-trips, a consumed body is a controlled 400", async () => {
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded", ""]) {
      const request = new Request("http://localhost/api/x", { method: "POST", headers: contentType ? { "content-type": contentType } : {}, body: '{"message":"Эрүүгийн хууль","n":1}' });
      await expect(readJsonBody(request)).resolves.toEqual({ message: "Эрүүгийн хууль", n: 1 });
    }
    const once = jsonRequest('{"a":1}');
    await expect(readJsonBody(once)).resolves.toEqual({ a: 1 });
    await expect(readJsonBody(once)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 }); // body already read
  });

  it("the message is generic: it never echoes the request body or a parser detail", async () => {
    const secret = "SECRET-LEGAL-QUESTION-TEXT";
    const error = (await readJsonBody(jsonRequest(`{"message":"${secret}`)).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toMatch(/JSON|Unexpected|position|token/i);
  });
});

describe("every API route that reads a request body guards it", () => {
  function routeFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) routeFiles(full, acc);
      else if (name === "route.ts") acc.push(full);
    }
    return acc;
  }

  it("no route calls request.json() unguarded (use readJsonBody, or an explicit .catch)", () => {
    const offenders: string[] = [];
    for (const file of routeFiles(path.join(process.cwd(), "src/app/api"))) {
      readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (line.includes("request.json()") && !line.includes(".catch(")) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

// ── route level: chat ────────────────────────────────────────────────────────────────────────────────────────────────────
const lookupAuthSession = vi.fn();
const requireActor = vi.fn();
const resolveGuestSession = vi.fn();
const consumeRateLimit = vi.fn();
const createTurn = vi.fn();
const getLegalAiService = vi.fn(() => ({ createTurn }));
const assertEmailVerified = vi.fn();
const guardLawyerAiHttp = vi.fn();
const checkOrthographyForPaidUser = vi.fn();
const generateCaseAiAnalysisForLawyer = vi.fn();
const getLatestCaseAiAnalysisForLawyer = vi.fn();
const recordLawyerFeatureUsage = vi.fn();

vi.mock("@/application/common/session", () => ({ lookupAuthSession: () => lookupAuthSession() }));
vi.mock("@/application/common/require-actor", () => ({ requireActor: (...a: unknown[]) => requireActor(...a) }));
vi.mock("@/application/legal-ai/resolve-guest-session", () => ({ resolveGuestSession: (...a: unknown[]) => resolveGuestSession(...a) }));
vi.mock("@/application/ai/create-legal-ai-service", () => ({ getLegalAiService: () => getLegalAiService() }));
vi.mock("@/application/common/require-verified-email", () => ({ assertEmailVerified: (...a: unknown[]) => assertEmailVerified(...a) }));
vi.mock("@/application/common/guard-lawyer-ai-http", () => ({
  guardLawyerAiHttp: (...a: unknown[]) => guardLawyerAiHttp(...a),
  recordLawyerFeatureUsage: (...a: unknown[]) => recordLawyerFeatureUsage(...a),
}));
vi.mock("@/infrastructure/security/rate-limiter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/security/rate-limiter")>()),
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a),
}));
vi.mock("@/application/use-cases/case-review", () => ({ assertOwnedCaseFileForAi: vi.fn() }));
vi.mock("@/application/use-cases/matters/matter-conversation", () => ({ assertOwnedMatterForAi: vi.fn() }));
vi.mock("@/application/use-cases/orthography/check-orthography", () => ({ checkOrthographyForPaidUser: (...a: unknown[]) => checkOrthographyForPaidUser(...a) }));
vi.mock("@/application/use-cases/case-review/case-ai-analysis", () => ({
  generateCaseAiAnalysisForLawyer: (...a: unknown[]) => generateCaseAiAnalysisForLawyer(...a),
  getLatestCaseAiAnalysisForLawyer: (...a: unknown[]) => getLatestCaseAiAnalysisForLawyer(...a),
}));
vi.mock("@/infrastructure/repositories", () => ({ entitlementUsageRepository: {}, subscriptionRepository: {}, userRepository: {} }));

import { POST as chatPOST } from "@/app/api/ai/chat/route";
import { POST as orthographyPOST } from "@/app/api/orthography/check/route";
import { POST as caseAnalysisPOST } from "@/app/api/lawyer/case-review/ai-analysis/route";

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const m of [lookupAuthSession, requireActor, resolveGuestSession, consumeRateLimit, createTurn, assertEmailVerified, guardLawyerAiHttp, checkOrthographyForPaidUser, generateCaseAiAnalysisForLawyer, getLatestCaseAiAnalysisForLawyer, recordLawyerFeatureUsage]) m.mockReset();
  getLegalAiService.mockClear();
  lookupAuthSession.mockResolvedValue({ session: null, replaced: false });
  resolveGuestSession.mockResolvedValue({ id: "g1", cookieValue: null, expiresAt: new Date("2030-01-01T00:00:00Z") });
  consumeRateLimit.mockResolvedValue({ ok: true });
  guardLawyerAiHttp.mockResolvedValue({ usageId: "u1" });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

async function expectControlled400(res: Response) {
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body).toMatchObject({ code: "VALIDATION_ERROR", error: INVALID_JSON_BODY_MESSAGE });
  expect(JSON.stringify(body)).not.toMatch(/SyntaxError|Unexpected token|stack|at \w+\s*\(/);
  expect(consoleError).not.toHaveBeenCalled(); // a bad client body is not a server fault: no logged stack trace
}

describe("POST /api/ai/chat — malformed body", () => {
  it.each(BAD_BODIES)("answers a controlled 400 for %s and never reaches the AI service", async (_label, raw) => {
    const res = await chatPOST(jsonRequest(raw));
    await expectControlled400(res);
    expect(getLegalAiService).not.toHaveBeenCalled();
    expect(createTurn).not.toHaveBeenCalled();
  });

  it("authentication still comes first: no actor and no guest session stays 401, not 400", async () => {
    resolveGuestSession.mockResolvedValue(null);
    const res = await chatPOST(jsonRequest("{bad"));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("the rate limit still comes first: a limited caller gets 429 before the body is read", async () => {
    consumeRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 7 });
    const res = await chatPOST(jsonRequest("{bad"));
    expect(res.status).toBe(429);
  });

  it("a valid body still streams a normal turn (unchanged behaviour)", async () => {
    createTurn.mockResolvedValue({ conversationId: "c1", message: { id: "m1", role: "ASSISTANT", content: "Хариулт.", citations: [] } });
    const res = await chatPOST(jsonRequest(JSON.stringify({ message: "Асуулт" })));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: done");
    expect(createTurn).toHaveBeenCalledTimes(1);
    expect(createTurn.mock.calls[0]![0]).toMatchObject({ message: "Асуулт", guestSessionId: "g1" });
  });
});

describe("POST /api/orthography/check — malformed body", () => {
  it.each(BAD_BODIES)("answers a controlled 400 for %s without running the checker", async (_label, raw) => {
    await expectControlled400(await orthographyPOST(jsonRequest(raw)));
    expect(checkOrthographyForPaidUser).not.toHaveBeenCalled();
  });

  it("the rate limit still comes first (429) and a valid body still reaches the checker", async () => {
    consumeRateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 3 });
    expect((await orthographyPOST(jsonRequest("{bad"))).status).toBe(429);
    checkOrthographyForPaidUser.mockResolvedValue({ issues: [] });
    const res = await orthographyPOST(jsonRequest(JSON.stringify({ text: "сайн байна уу" })));
    expect(res.status).toBe(200);
    expect(checkOrthographyForPaidUser).toHaveBeenCalledWith(null, { text: "сайн байна уу", includeLatinToCyrillic: false }, expect.anything());
  });
});

describe("POST /api/lawyer/case-review/ai-analysis — malformed body", () => {
  const lawyer = { userId: "l1", role: UserRole.LAWYER };

  it.each(BAD_BODIES)("answers a controlled 400 for %s before any analysis runs", async (_label, raw) => {
    requireActor.mockResolvedValue(lawyer);
    await expectControlled400(await caseAnalysisPOST(jsonRequest(raw)));
    expect(generateCaseAiAnalysisForLawyer).not.toHaveBeenCalled();
    expect(recordLawyerFeatureUsage).not.toHaveBeenCalled();
  });

  it("authorization still comes first: an unauthenticated caller stays 401, not 400", async () => {
    requireActor.mockRejectedValue(new UnauthorizedError());
    const res = await caseAnalysisPOST(jsonRequest("{bad"));
    expect(res.status).toBe(401);
  });

  it("a valid object without caseId keeps its existing field-level 400 message", async () => {
    requireActor.mockResolvedValue(lawyer);
    const res = await caseAnalysisPOST(jsonRequest("{}"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "caseId шаардлагатай.", code: "VALIDATION_ERROR" });
  });
});
