import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((href: string): never => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import { loadOrForbidden } from "@/application/common/load-or-forbidden";
import { DomainError, ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";

describe("loadOrForbidden (case-review pages)", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("returns the loaded value", async () => {
    expect(await loadOrForbidden(async () => ({ id: "c1" }))).toEqual({ kind: "ok", value: { id: "c1" } });
  });

  it("someone else's case → 'forbidden' (the page shows its no-access state), never the data and never a redirect", async () => {
    const result = await loadOrForbidden(async () => {
      throw new ForbiddenError("not yours");
    });
    expect(result).toEqual({ kind: "forbidden" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("a missing case redirects to the cases list (or the given href)", async () => {
    await expect(loadOrForbidden(async () => { throw new NotFoundError("Хэрэг"); })).rejects.toThrow("NEXT_REDIRECT:/lawyer/workspace/cases");
    await expect(loadOrForbidden(async () => { throw new NotFoundError("x"); }, "/elsewhere")).rejects.toThrow("NEXT_REDIRECT:/elsewhere");
  });

  it("any other failure is rethrown unchanged — it is not disguised as 'forbidden' or 'not found'", async () => {
    const boom = new Error("database down");
    await expect(loadOrForbidden(async () => { throw boom; })).rejects.toBe(boom);
    const other = new DomainError("rate limited", "RATE_LIMITED", 429);
    await expect(loadOrForbidden(async () => { throw other; })).rejects.toBe(other);
    expect(redirect).not.toHaveBeenCalled();
  });
});
