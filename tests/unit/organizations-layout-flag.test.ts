import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionReplacedError, UnauthorizedError } from "@/domain/errors/domain-error";

/**
 * /organizations layout. Policy: with TORE_FOUNDATION_ORGS_V1 off the feature does not exist for anyone -> 404, decided BEFORE any
 * actor/session lookup (same policy as the pages). Regression: the layout used to call redirect(dashboard) inside a try whose catch
 * swallowed redirect()'s control-flow exception and sent signed-in users to /login instead.
 * Real here: the layout, the real flag reader (env var) and Next's real notFound()/redirect(). Mocked: session/actor/dictionary lookups.
 * Edge middleware (anonymous -> /login for /organizations) is not exercised.
 */
const requireActor = vi.fn();
const requirePageSession = vi.fn();
const getSessionUser = vi.fn();
const getActiveContextSwitcherModel = vi.fn();

vi.mock("@/application/common/require-actor", () => ({ requireActor: (...a: unknown[]) => requireActor(...a) }));
vi.mock("@/application/common/session", () => ({
  requirePageSession: (...a: unknown[]) => requirePageSession(...a),
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));
vi.mock("@/application/common/active-context-switcher-model", () => ({
  getActiveContextSwitcherModel: (...a: unknown[]) => getActiveContextSwitcherModel(...a),
}));
vi.mock("@/i18n/get-dictionary", () => ({
  getDictionary: async () => ({
    organizations: { backToDashboard: "b", listTitle: "l", createTitle: "c" },
    common: { language: "l", brand: "TORE" },
    dashboard: { signOut: "s" },
    marketplace: { common: { mainNav: "m", navigate: "n" } },
    activeContext: { label: "a" },
  }),
}));
vi.mock("@/i18n/get-locale", () => ({ getLocale: async () => "mn" }));

import OrganizationsLayout from "@/app/organizations/layout";

type Thrown = { name?: string; digest?: string };
async function run(): Promise<{ kind: "rendered" } | { kind: "threw"; error: Thrown }> {
  try {
    await OrganizationsLayout({ children: null });
    return { kind: "rendered" };
  } catch (error) {
    return { kind: "threw", error: error as Thrown };
  }
}
const digestOf = (r: Awaited<ReturnType<typeof run>>) => (r.kind === "threw" ? String(r.error.digest) : "");

beforeEach(() => {
  for (const m of [requireActor, requirePageSession, getSessionUser, getActiveContextSwitcherModel]) m.mockReset();
  getSessionUser.mockResolvedValue({ user: { name: "N", email: "e@x.mn" } });
  getActiveContextSwitcherModel.mockResolvedValue({ enabled: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("layout — flag OFF", () => {
  beforeEach(() => vi.stubEnv("TORE_FOUNDATION_ORGS_V1", ""));

  it.each([
    ["signed-in LAWYER", () => requireActor.mockResolvedValue({ userId: "u1", role: "LAWYER" })],
    ["signed-in CLIENT", () => requireActor.mockResolvedValue({ userId: "u2", role: "CLIENT" })],
    ["anonymous", () => requireActor.mockRejectedValue(new UnauthorizedError())],
    ["replaced session", () => requireActor.mockRejectedValue(new SessionReplacedError())],
  ])("%s: 404 — never a redirect to /login or the dashboard, and no session/actor lookup", async (_label, arrange) => {
    arrange();
    const result = await run();
    expect(digestOf(result)).toContain("404");
    expect(digestOf(result)).not.toContain("NEXT_REDIRECT");
    expect(requireActor).not.toHaveBeenCalled();
    expect(requirePageSession).not.toHaveBeenCalled();
    expect(getActiveContextSwitcherModel).not.toHaveBeenCalled();
  });

  it.each(["true", "yes", "0", "on", "2", " "])("flag value %j keeps the layout disabled", async (value) => {
    vi.stubEnv("TORE_FOUNDATION_ORGS_V1", value);
    requireActor.mockResolvedValue({ userId: "u1", role: "LAWYER" });
    expect(digestOf(await run())).toContain("404");
    expect(requireActor).not.toHaveBeenCalled();
  });

  it("an unset variable keeps the layout disabled", async () => {
    delete process.env.TORE_FOUNDATION_ORGS_V1;
    expect(digestOf(await run())).toContain("404");
    expect(requireActor).not.toHaveBeenCalled();
  });
});

describe("layout — flag ON (existing behaviour preserved)", () => {
  beforeEach(() => vi.stubEnv("TORE_FOUNDATION_ORGS_V1", "1"));

  it("signed-in user: renders the shell", async () => {
    requirePageSession.mockResolvedValue(undefined);
    requireActor.mockResolvedValue({ userId: "u1", role: "LAWYER" });
    expect((await run()).kind).toBe("rendered");
    expect(requirePageSession).toHaveBeenCalledTimes(1);
    expect(requireActor).toHaveBeenCalledTimes(1);
    expect(getActiveContextSwitcherModel).toHaveBeenCalledWith({ userId: "u1", role: "LAWYER" });
  });

  it("anonymous: the page-session guard's own refusal (its redirect) propagates untouched", async () => {
    const redirectSignal = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    requirePageSession.mockRejectedValue(redirectSignal);
    const result = await run();
    expect(result.kind === "threw" && result.error).toBe(redirectSignal);
    expect(requireActor).not.toHaveBeenCalled();
  });
});
