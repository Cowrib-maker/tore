import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EntitlementFeature, UserRole } from "@/domain/enums";
import { UnauthorizedError } from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";

/**
 * POST /api/ai/research-agent: flag, authentication, role pre-checks, rate limit, body validation, error shaping and the
 * accounting invariant (no Legal AI question entitlement is reserved or consumed). The agent itself is covered by
 * legal-research-agent.test.ts, so it is mocked here.
 */
const requireActor = vi.fn();
const assertEmailVerified = vi.fn();
const guardLawyerAiHttp = vi.fn();
const consumeRateLimit = vi.fn();
const run = vi.fn();
const recordLawyerFeatureUsage = vi.fn();

vi.mock("@/application/common/require-actor", () => ({ requireActor: (...a: unknown[]) => requireActor(...a) }));
vi.mock("@/application/common/require-verified-email", () => ({ assertEmailVerified: (...a: unknown[]) => assertEmailVerified(...a) }));
vi.mock("@/application/common/guard-lawyer-ai-http", () => ({
  guardLawyerAiHttp: (...a: unknown[]) => guardLawyerAiHttp(...a),
  recordLawyerFeatureUsage: (...a: unknown[]) => recordLawyerFeatureUsage(...a),
}));
vi.mock("@/infrastructure/security/rate-limiter", () => ({
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a),
  LEGAL_AI_CHAT_RATE_LIMIT: { limit: 5, windowMs: 1000 },
  legalAiChatRateLimitKey: (k: string) => `chat:${k}`,
}));
vi.mock("@/application/legal-research-agent/create-legal-research-agent", () => ({
  getLegalResearchAgent: () => ({ run: (...a: unknown[]) => run(...a) }),
}));

import { POST } from "@/app/api/ai/research-agent/route";

const post = (body: unknown, raw = false) =>
  POST(
    new Request("http://localhost/api/ai/research-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  for (const m of [requireActor, assertEmailVerified, guardLawyerAiHttp, consumeRateLimit, run, recordLawyerFeatureUsage]) m.mockReset();
  consumeRateLimit.mockResolvedValue({ ok: true });
  run.mockResolvedValue({ status: "SUPPORTED", findings: [] });
  vi.stubEnv("TORE_LEGAL_RESEARCH_AGENT_V1", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("feature flag", () => {
  it.each(["", "true", "0", "yes"])("flag %j: 404 before authentication, rate limiting or the agent", async (value) => {
    vi.stubEnv("TORE_LEGAL_RESEARCH_AGENT_V1", value);
    const response = await post({ question: "Асуулт" });
    expect(response.status).toBe(404);
    expect(requireActor).not.toHaveBeenCalled();
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("unset flag: 404", async () => {
    delete process.env.TORE_LEGAL_RESEARCH_AGENT_V1;
    expect((await post({ question: "Асуулт" })).status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("authentication and authorization", () => {
  it("anonymous / guest: 401, nothing else runs", async () => {
    requireActor.mockRejectedValue(new UnauthorizedError());
    const response = await post({ question: "Асуулт" });
    expect(response.status).toBe(401);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("lawyer: email verification and subscription validity are checked first, without touching the quota", async () => {
    requireActor.mockResolvedValue({ userId: "u1", role: UserRole.LAWYER });
    await post({ question: "Асуулт" });
    expect(assertEmailVerified).toHaveBeenCalledWith("u1");
    expect(guardLawyerAiHttp).toHaveBeenCalledWith({ userId: "u1", role: UserRole.LAWYER }, EntitlementFeature.LEGAL_AI_QUERY, { checkQuota: false });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("lawyer without a valid subscription: refused with the entitlement error, agent not run", async () => {
    requireActor.mockResolvedValue({ userId: "u1", role: UserRole.LAWYER });
    guardLawyerAiHttp.mockRejectedValue(new EntitlementError("Захиалга идэвхгүй", "SUBSCRIPTION_INACTIVE", 402));
    const response = await post({ question: "Асуулт" });
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe("SUBSCRIPTION_INACTIVE");
    expect(run).not.toHaveBeenCalled();
  });

  it("client: no lawyer pre-checks, agent runs", async () => {
    requireActor.mockResolvedValue({ userId: "c1", role: UserRole.CLIENT });
    expect((await post({ question: "Асуулт" })).status).toBe(200);
    expect(guardLawyerAiHttp).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("rate limit, body and errors", () => {
  beforeEach(() => requireActor.mockResolvedValue({ userId: "c1", role: UserRole.CLIENT }));

  it("rate limited: 429, agent not run", async () => {
    consumeRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 7 });
    const response = await post({ question: "Асуулт" });
    expect(response.status).toBe(429);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([["{not json", true], ["null", true], ["[]", true], ['"text"', true]])("malformed body %j: 400, agent not run", async (body, raw) => {
    const response = await post(body, raw);
    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("passes the question and the request's abort signal to the agent and returns its result unchanged", async () => {
    run.mockResolvedValue({ status: "SUPPORTED", findings: [{ title: "T" }] });
    const response = await post({ question: "Асуулт", mode: "LAWYER", userId: "other", tools: ["fetch_url"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "SUPPORTED", findings: [{ title: "T" }] });
    // Only the question is taken from the body: no client-supplied tool, role or user id reaches the agent.
    expect(run).toHaveBeenCalledWith({ question: "Асуулт", signal: expect.any(AbortSignal) });
  });

  it("a non-string question is rejected by the agent's validation (400 via the controlled error path)", async () => {
    const { ValidationError } = await import("@/domain/errors/domain-error");
    run.mockRejectedValue(new ValidationError("Судалгааны асуултаа бичнэ үү."));
    const response = await post({ question: 42 });
    expect(response.status).toBe(400);
  });

  it("unexpected failure: generic 500, no internal detail leaked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    run.mockRejectedValue(new Error("db password=hunter2"));
    const response = await post({ question: "Асуулт" });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("hunter2");
  });

  it("accounting invariant: no usage is recorded or question entitlement consumed on success", async () => {
    requireActor.mockResolvedValue({ userId: "u1", role: UserRole.LAWYER });
    await post({ question: "Асуулт" });
    expect(recordLawyerFeatureUsage).not.toHaveBeenCalled();
    expect(guardLawyerAiHttp).toHaveBeenCalledTimes(1);
    expect(guardLawyerAiHttp.mock.calls[0][2]).toEqual({ checkQuota: false });
  });
});
