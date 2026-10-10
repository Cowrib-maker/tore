import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

const h = vi.hoisted(() => ({
  requireActor: vi.fn(),
  upsert: vi.fn(),
  saveDraft: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath, updateTag: vi.fn() }));
vi.mock("@/application/common/require-actor", () => ({ requireActor: h.requireActor }));
vi.mock("@/application/common/client-ip", () => ({ getClientIp: async () => "203.0.113.5" }));
vi.mock("@/infrastructure/repositories", () => ({
  homepageContentRepository: { findAll: async () => [], findByLocale: async () => null, upsert: h.upsert },
  siteContentRepository: { findAll: async () => [], saveDraft: h.saveDraft },
  auditLogRepository: { create: vi.fn() },
  userRepository: { findById: async () => null },
}));

import { adminSaveHomepageContentAction } from "@/application/actions/admin-homepage-content.actions";
import { importLegacyHomepageContentAction } from "@/application/actions/admin-site-content-legacy.actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireActor.mockResolvedValue({ userId: "admin-1", role: UserRole.ADMIN });
});

describe("the retired homepage editor can no longer write", () => {
  it("refuses to save, points to /admin/content, and never touches the legacy table (even for an admin)", async () => {
    const result = await adminSaveHomepageContentAction({} as never);
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain("/admin/content");
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe("legacy import action", () => {
  it("is refused for non-admins and signed-out callers", async () => {
    h.requireActor.mockRejectedValueOnce(new ForbiddenError());
    expect(await importLegacyHomepageContentAction()).toEqual({ ok: false, message: "Таны эрх хүрэхгүй байна." });
    h.requireActor.mockResolvedValueOnce({ userId: "c", role: UserRole.CLIENT });
    expect(await importLegacyHomepageContentAction()).toMatchObject({ ok: false });
    expect(h.saveDraft).not.toHaveBeenCalled();
  });

  it("runs for an admin, reports counts, and never writes the legacy table", async () => {
    expect(await importLegacyHomepageContentAction()).toEqual({ ok: true, imported: 0, skippedManaged: 0, invalid: 0 });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
