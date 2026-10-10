import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/domain/enums";
import { ForbiddenError, UnauthorizedError } from "@/domain/errors/domain-error";

const h = vi.hoisted(() => ({ requireActor: vi.fn(), redirect: vi.fn() }));
vi.mock("@/application/common/require-actor", () => ({ requireActor: h.requireActor }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    h.redirect(to);
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

import { requireAdminPage } from "@/application/common/require-admin-page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdminPage (gate for /admin/content and /admin/preview)", () => {
  it("returns the actor for an active ADMIN, asking for the ADMIN role explicitly", async () => {
    h.requireActor.mockResolvedValue({ userId: "a", role: UserRole.ADMIN });
    await expect(requireAdminPage()).resolves.toEqual({ userId: "a", role: UserRole.ADMIN });
    expect(h.requireActor).toHaveBeenCalledWith(UserRole.ADMIN);
  });

  it.each([
    ["signed out", new UnauthorizedError()],
    ["a citizen or lawyer", new ForbiddenError()],
  ])("sends %s to /login and never renders the page", async (_n, error) => {
    h.requireActor.mockRejectedValue(error);
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(h.redirect).toHaveBeenCalledWith("/login");
  });

  it("does not swallow unexpected failures (a database outage is not an authorization decision)", async () => {
    h.requireActor.mockRejectedValue(new Error("db down"));
    await expect(requireAdminPage()).rejects.toThrow("db down");
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
