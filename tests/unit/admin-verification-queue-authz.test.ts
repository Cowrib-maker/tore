import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole, UserStatus } from "@/domain/enums";

/**
 * P1 hardening milestone — getAdminLawyerVerificationQueue authorization.
 *
 * Prior state: gated solely on `session.user.role !== UserRole.ADMIN`, a
 * JWT-cached claim refreshed from the database at most once every 60s
 * (PRIVILEGE_REFRESH_MS). A just-demoted or just-deactivated admin's
 * still-live session could keep reading the full credential-review queue
 * and lawyer directory for up to that window.
 *
 * Fixed by switching to requireActor(UserRole.ADMIN), which re-reads
 * role/status from the database on every single call (require-actor.ts),
 * independent of the JWT. These tests mock requireActor's own two
 * dependencies (lookupAuthSession + userRepository.findById) so the REAL
 * requireActor implementation runs — proving the fix's freshness guarantee
 * end to end, not just that some function was called.
 */

const lookupAuthSession = vi.fn();
const findById = vi.fn();
const findByRole = vi.fn();
const findPendingReview = vi.fn();
const findAllActive = vi.fn();

vi.mock("@/application/common/session", () => ({
  lookupAuthSession: (...args: unknown[]) => lookupAuthSession(...args),
  getSessionUser: vi.fn(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  userRepository: {
    findById: (...args: unknown[]) => findById(...args),
    findByRole: (...args: unknown[]) => findByRole(...args),
  },
  lawyerCredentialRepository: {
    findPendingReview: (...args: unknown[]) => findPendingReview(...args),
    findByLawyerProfileId: vi.fn(),
  },
  lawyerProfileRepository: {
    findByUserId: vi.fn(),
  },
  lawyerTaxonomyRepository: {},
  practiceAreaRepository: {
    findAllActive: (...args: unknown[]) => findAllActive(...args),
  },
  auditLogRepository: {},
}));

vi.mock("@/infrastructure/database/prisma-unit-of-work", () => ({
  unitOfWork: {},
}));

vi.mock("@/infrastructure/storage", () => ({
  getFileStorage: () => ({}),
}));

function activeAdminSession(userId = "admin-1") {
  return {
    session: {
      user: { id: userId, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    replaced: false,
  };
}

describe("getAdminLawyerVerificationQueue — fresh DB authorization (no stale JWT-only gate)", () => {
  beforeEach(() => {
    lookupAuthSession.mockReset();
    findById.mockReset();
    findByRole.mockReset().mockResolvedValue([]);
    findPendingReview.mockReset().mockResolvedValue({ items: [] });
    findAllActive.mockReset().mockResolvedValue([]);
  });

  it("ADMIN succeeds", async () => {
    lookupAuthSession.mockResolvedValue(activeAdminSession("admin-ok"));
    findById.mockResolvedValue({
      id: "admin-ok",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    const { getAdminLawyerVerificationQueue } = await import(
      "@/application/actions/verification.actions"
    );
    const result = await getAdminLawyerVerificationQueue();

    expect(result.status).toBe("ok");
  });

  it("LAWYER is denied", async () => {
    lookupAuthSession.mockResolvedValue({
      session: {
        user: { id: "lawyer-1", role: UserRole.LAWYER, status: UserStatus.ACTIVE },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      replaced: false,
    });
    findById.mockResolvedValue({
      id: "lawyer-1",
      role: UserRole.LAWYER,
      status: UserStatus.ACTIVE,
    });

    const { getAdminLawyerVerificationQueue } = await import(
      "@/application/actions/verification.actions"
    );
    const result = await getAdminLawyerVerificationQueue();

    expect(result.status).toBe("forbidden");
  });

  it("CLIENT is denied", async () => {
    lookupAuthSession.mockResolvedValue({
      session: {
        user: { id: "client-1", role: UserRole.CLIENT, status: UserStatus.ACTIVE },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      replaced: false,
    });
    findById.mockResolvedValue({
      id: "client-1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
    });

    const { getAdminLawyerVerificationQueue } = await import(
      "@/application/actions/verification.actions"
    );
    const result = await getAdminLawyerVerificationQueue();

    expect(result.status).toBe("forbidden");
  });

  it("a DEACTIVATED admin is denied even though their session was issued while ACTIVE", async () => {
    lookupAuthSession.mockResolvedValue(activeAdminSession("admin-deactivated"));
    // The database (source of truth) says this admin is now deactivated —
    // requireActor must reject this, regardless of the session snapshot.
    findById.mockResolvedValue({
      id: "admin-deactivated",
      role: UserRole.ADMIN,
      status: UserStatus.DEACTIVATED,
    });

    const { getAdminLawyerVerificationQueue } = await import(
      "@/application/actions/verification.actions"
    );
    const result = await getAdminLawyerVerificationQueue();

    expect(result.status).toBe("unauthenticated");
  });

  it("REGRESSION: role demotion is respected immediately — no stale JWT-only authorization remains in this function", async () => {
    // The session snapshot (what a cached JWT would still say) claims
    // ADMIN — exactly the shape of the OLD, vulnerable code path's sole
    // check. The fresh database record (what requireActor actually reads)
    // says this account was just demoted to CLIENT. If this function still
    // trusted the session snapshot alone, it would incorrectly succeed.
    lookupAuthSession.mockResolvedValue(activeAdminSession("just-demoted"));
    findById.mockResolvedValue({
      id: "just-demoted",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
    });

    const { getAdminLawyerVerificationQueue } = await import(
      "@/application/actions/verification.actions"
    );
    const result = await getAdminLawyerVerificationQueue();

    expect(result.status).toBe("forbidden");
    // Proves the fresh DB read actually happened — the old code path never
    // consulted userRepository.findById at all.
    expect(findById).toHaveBeenCalledWith("just-demoted");
  });

  it("no session at all is treated as unauthenticated", async () => {
    lookupAuthSession.mockResolvedValue({ session: null, replaced: false });

    const { getAdminLawyerVerificationQueue } = await import(
      "@/application/actions/verification.actions"
    );
    const result = await getAdminLawyerVerificationQueue();

    expect(result.status).toBe("unauthenticated");
    expect(findById).not.toHaveBeenCalled();
  });
});
