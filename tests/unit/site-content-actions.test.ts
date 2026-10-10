import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/domain/enums";
import { ForbiddenError, UnauthorizedError } from "@/domain/errors/domain-error";
import { FakeSiteContentRepository } from "./site-content-fake-repository";

const h = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  requireActor: vi.fn(),
  repo: null as unknown,
}));

vi.mock("next/cache", () => ({ updateTag: h.updateTag, revalidatePath: h.revalidatePath }));
vi.mock("@/application/common/require-actor", () => ({ requireActor: h.requireActor }));
vi.mock("@/application/common/client-ip", () => ({ getClientIp: async () => "203.0.113.9" }));
vi.mock("@/infrastructure/repositories", () => ({
  // The action module captures this once at import; delegate every call to whichever fake the current test installed.
  siteContentRepository: new Proxy({}, { get: (_t, prop) => (h.repo as Record<string | symbol, unknown>)[prop] }),
  userRepository: { findById: async (id: string) => ({ id, email: `${id}@tore.test`, name: null }) },
}));

import {
  discardSiteContentDraftAction,
  publishSiteContentAction,
  restoreSiteContentRevisionAction,
  saveSiteContentDraftAction,
  unpublishSiteContentAction,
} from "@/application/actions/admin-site-content.actions";
import { SITE_CONTENT_CACHE_TAG } from "@/application/use-cases/site-content/published-site-content";

const KEY = "home.hero.tagline";
let repo: FakeSiteContentRepository;

beforeEach(() => {
  vi.clearAllMocks();
  repo = new FakeSiteContentRepository();
  h.repo = repo;
  h.requireActor.mockResolvedValue({ userId: "admin-1", role: UserRole.ADMIN });
});

describe("server actions: authorization happens on the server", () => {
  it("a signed-out caller and a non-admin caller are refused before anything is read or written", async () => {
    h.requireActor.mockRejectedValueOnce(new UnauthorizedError());
    expect(await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "x", expectedVersion: 0 })).toMatchObject({ ok: false, code: "unauthorized" });
    h.requireActor.mockRejectedValueOnce(new ForbiddenError());
    expect(await publishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: 1 })).toMatchObject({ ok: false, code: "forbidden" });
    h.requireActor.mockRejectedValueOnce(new ForbiddenError());
    expect(await unpublishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: 1 })).toMatchObject({ ok: false, code: "forbidden" });
    h.requireActor.mockRejectedValueOnce(new ForbiddenError());
    expect(await restoreSiteContentRevisionAction({ key: KEY, locale: "mn", revision: 1, expectedVersion: 1 })).toMatchObject({ ok: false, code: "forbidden" });
    h.requireActor.mockRejectedValueOnce(new ForbiddenError());
    expect(await discardSiteContentDraftAction({ key: KEY, locale: "mn", expectedVersion: 1 })).toMatchObject({ ok: false, code: "forbidden" });
    expect(repo.writes).toBe(0);
    expect(h.updateTag).not.toHaveBeenCalled();
  });

  it("every action asks for the ADMIN role specifically", async () => {
    await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "x", expectedVersion: 0 });
    await publishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: 1 });
    for (const call of h.requireActor.mock.calls) expect(call[0]).toBe(UserRole.ADMIN);
  });

  it("even if the transport guard were bypassed, the use case re-checks the role", async () => {
    h.requireActor.mockResolvedValue({ userId: "u-1", role: UserRole.CLIENT });
    expect(await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "x", expectedVersion: 0 })).toMatchObject({ ok: false, code: "forbidden" });
    expect(repo.writes).toBe(0);
  });
});

describe("cache invalidation", () => {
  it("publishing expires the site-content cache tag and the homepage — exactly once, after success", async () => {
    const draft = await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "Шинэ уриа", expectedVersion: 0 });
    expect(draft.ok).toBe(true);
    expect(h.updateTag).not.toHaveBeenCalled(); // a draft changes nothing public
    const published = await publishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: draft.ok ? draft.version : -1 });
    expect(published).toMatchObject({ ok: true, publishedRevision: 1 });
    expect(h.updateTag).toHaveBeenCalledTimes(1);
    expect(h.updateTag).toHaveBeenCalledWith(SITE_CONTENT_CACHE_TAG);
    expect(h.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("unpublishing also refreshes the public cache", async () => {
    const d = await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "Шинэ", expectedVersion: 0 });
    const p = await publishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: d.ok ? d.version : -1 });
    h.updateTag.mockClear();
    await unpublishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: p.ok ? p.version : -1 });
    expect(h.updateTag).toHaveBeenCalledWith(SITE_CONTENT_CACHE_TAG);
  });

  it("restoring a revision only creates a draft, so it does not touch the public cache", async () => {
    const d = await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "Шинэ", expectedVersion: 0 });
    const p = await publishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: d.ok ? d.version : -1 });
    h.updateTag.mockClear();
    const r = await restoreSiteContentRevisionAction({ key: KEY, locale: "mn", revision: 1, expectedVersion: p.ok ? p.version : -1 });
    expect(r.ok).toBe(true);
    expect(h.updateTag).not.toHaveBeenCalled();
  });

  it("failed or conflicting publishes never invalidate and never report success", async () => {
    const d = await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "Шинэ", expectedVersion: 0 });
    const version = d.ok ? d.version : -1;
    const stale = await publishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: version - 1 });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });

    repo.failAudit = true;
    const failed = await publishSiteContentAction({ key: KEY, locale: "mn", expectedVersion: version });
    expect(failed).toMatchObject({ ok: false, code: "error" });
    expect((failed as { message: string }).message).not.toMatch(/audit store down/); // internals are not leaked
    expect(h.updateTag).not.toHaveBeenCalled();
    expect(await repo.findPublished("mn")).toEqual({});
  });
});

describe("error mapping", () => {
  it("validation problems come back as a readable validation result, not a success", async () => {
    const r = await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "<script>alert(1)</script>", expectedVersion: 0 });
    expect(r).toMatchObject({ ok: false, code: "validation" });
    expect(repo.writes).toBe(0);
  });

  it("a stale save is reported as a conflict", async () => {
    await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "A", expectedVersion: 0 });
    expect(await saveSiteContentDraftAction({ key: KEY, locale: "mn", value: "B", expectedVersion: 0 })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("unknown keys are reported as not found", async () => {
    expect(await saveSiteContentDraftAction({ key: "billing.price", locale: "mn", value: "x", expectedVersion: 0 })).toMatchObject({ ok: false, code: "not_found" });
  });
});
