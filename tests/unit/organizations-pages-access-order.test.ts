import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/domain/errors/domain-error";

/**
 * /organizations pages: the feature flag (TORE_FOUNDATION_ORGS_V1) is checked FIRST, before any authentication or data access.
 *
 * Why: production logged an uncaught `ForbiddenError: Organization foundation provisioning is disabled` from /organizations.rsc.
 * The layout's redirect does not stop the page from running (Next.js renders layouts and pages in parallel and a layout does not
 * control whether the route renders), so each page must refuse to touch the flag-guarded use cases itself.
 *
 * What is real here: the three pages, the server-action wrappers, the use cases and the real flag reader (driven through the
 * environment variable). What is mocked: the signed-in actor, the repositories and the dictionary. Edge middleware
 * (src/middleware.ts), which redirects anonymous visitors of /organizations to /login before any page renders, is not exercised.
 */
const requireActor = vi.fn();
const listActiveMembershipsForUser = vi.fn();
const findActiveMembershipForUser = vi.fn();

vi.mock("@/application/common/require-actor", () => ({ requireActor: (...a: unknown[]) => requireActor(...a) }));
vi.mock("@/infrastructure/repositories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/repositories")>()),
  organizationRepository: {
    listActiveMembershipsForUser: (...a: unknown[]) => listActiveMembershipsForUser(...a),
    findActiveMembershipForUser: (...a: unknown[]) => findActiveMembershipForUser(...a),
  },
  unitOfWork: {},
}));
vi.mock("@/i18n/get-dictionary", () => ({ getDictionary: async () => ({ organizations: {} }) }));

import OrganizationsPage from "@/app/organizations/page";
import NewOrganizationPage from "@/app/organizations/new/page";
import OrganizationOverviewPage from "@/app/organizations/[organizationId]/page";

const lawyer = { userId: "u1", role: "LAWYER" };
const pages: Array<[string, () => Promise<unknown>]> = [
  ["list", () => OrganizationsPage()],
  ["new", () => NewOrganizationPage()],
  ["overview", () => OrganizationOverviewPage({ params: Promise.resolve({ organizationId: "org-1" }) })],
];

async function outcome(run: () => Promise<unknown>): Promise<{ kind: "rendered" } | { kind: "threw"; error: { name?: string; digest?: string } }> {
  try {
    await run();
    return { kind: "rendered" };
  } catch (error) {
    return { kind: "threw", error: error as { name?: string; digest?: string } };
  }
}
const is404 = (o: Awaited<ReturnType<typeof outcome>>) => o.kind === "threw" && String(o.error.digest).includes("404");

beforeEach(() => {
  for (const m of [requireActor, listActiveMembershipsForUser, findActiveMembershipForUser]) m.mockReset();
  listActiveMembershipsForUser.mockResolvedValue([]);
  findActiveMembershipForUser.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe.each(pages)("%s page — flag OFF", (_name, run) => {
  beforeEach(() => vi.stubEnv("TORE_FOUNDATION_ORGS_V1", ""));

  it("anonymous visitor: 404, and neither the actor lookup nor any repository is touched (nothing is probed or leaked)", async () => {
    requireActor.mockRejectedValue(new UnauthorizedError());
    const result = await outcome(run);
    expect(is404(result)).toBe(true);
    expect(requireActor).not.toHaveBeenCalled();
    expect(listActiveMembershipsForUser).not.toHaveBeenCalled();
    expect(findActiveMembershipForUser).not.toHaveBeenCalled();
  });

  it("signed-in user: 404 as well — never the ForbiddenError that used to escape as a 500", async () => {
    requireActor.mockResolvedValue(lawyer);
    const result = await outcome(run);
    expect(is404(result)).toBe(true);
    expect(result.kind === "threw" && result.error.name).not.toBe("ForbiddenError");
    expect(requireActor).not.toHaveBeenCalled(); // the flag is checked before the actor is even looked up
    expect(listActiveMembershipsForUser).not.toHaveBeenCalled();
    expect(findActiveMembershipForUser).not.toHaveBeenCalled();
  });
});

/**
 * Only the value 1 enables the flag: "true", "yes", "on", "0", blank and an unset variable all keep it off. (The existing flag reader,
 * `allowFlag`, additionally strips surrounding whitespace/quotes from dotenv-style values before comparing with "1"; that behaviour is
 * unchanged and not asserted here.)
 */
describe("only the value 1 enables the flag", () => {
  it.each(["true", "yes", "0", "on", "TRUE", "2", " "])("%j keeps the pages disabled (404, nothing touched)", async (value) => {
    vi.stubEnv("TORE_FOUNDATION_ORGS_V1", value);
    requireActor.mockResolvedValue(lawyer);
    for (const [, run] of pages) expect(is404(await outcome(run))).toBe(true);
    expect(requireActor).not.toHaveBeenCalled();
    expect(listActiveMembershipsForUser).not.toHaveBeenCalled();
    expect(findActiveMembershipForUser).not.toHaveBeenCalled();
  });

  it("an unset variable keeps the pages disabled (404, nothing touched)", async () => {
    delete process.env.TORE_FOUNDATION_ORGS_V1;
    requireActor.mockResolvedValue(lawyer);
    for (const [, run] of pages) expect(is404(await outcome(run))).toBe(true);
    expect(requireActor).not.toHaveBeenCalled();
    expect(listActiveMembershipsForUser).not.toHaveBeenCalled();
  });
});

describe("flag ON", () => {
  beforeEach(() => vi.stubEnv("TORE_FOUNDATION_ORGS_V1", "1"));

  it.each(pages)("%s page — anonymous access is still refused by the data layer (UnauthorizedError, never 404, no repository read)", async (_name, run) => {
    requireActor.mockRejectedValue(new UnauthorizedError());
    const result = await outcome(run);
    expect(result.kind).toBe("threw");
    expect(result.kind === "threw" && result.error.name).toBe("UnauthorizedError");
    expect(listActiveMembershipsForUser).not.toHaveBeenCalled();
    expect(findActiveMembershipForUser).not.toHaveBeenCalled();
  });

  it("list page — a signed-in user gets their own memberships (behaviour unchanged)", async () => {
    requireActor.mockResolvedValue(lawyer);
    expect((await outcome(() => OrganizationsPage())).kind).toBe("rendered");
    expect(listActiveMembershipsForUser).toHaveBeenCalledTimes(1);
    expect(listActiveMembershipsForUser).toHaveBeenCalledWith("u1");
  });

  it("new page — a signed-in user gets the form (behaviour unchanged)", async () => {
    requireActor.mockResolvedValue(lawyer);
    expect((await outcome(() => NewOrganizationPage())).kind).toBe("rendered");
    expect(requireActor).toHaveBeenCalledTimes(1);
  });

  it("overview page — a non-member still gets 404 (IDOR-safe), looked up by organization id AND user id (behaviour unchanged)", async () => {
    requireActor.mockResolvedValue(lawyer);
    const result = await outcome(() => OrganizationOverviewPage({ params: Promise.resolve({ organizationId: "org-1" }) }));
    expect(is404(result)).toBe(true);
    expect(findActiveMembershipForUser).toHaveBeenCalledWith("org-1", "u1");
  });
});
