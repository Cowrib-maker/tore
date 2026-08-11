import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  backfillPersonalTenantsUseCase,
  ensurePersonalTenantForUserUseCase,
} from "@/application/use-cases/tenancy/ensure-personal-tenant";
import { TenantKind, TenantStatus } from "@/domain/enums";
import {
  FOUNDATION_TENANT_V1_FLAG,
  isFoundationTenantV1Enabled,
} from "@/lib/feature-flags";

describe("foundation tenant feature flag", () => {
  afterEach(() => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
  });

  it("defaults to OFF when unset", () => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
    expect(isFoundationTenantV1Enabled()).toBe(false);
  });

  it("enables only when exactly 1", () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";
    expect(isFoundationTenantV1Enabled()).toBe(true);
    process.env[FOUNDATION_TENANT_V1_FLAG] = "true";
    expect(isFoundationTenantV1Enabled()).toBe(false);
  });
});

describe("ensurePersonalTenantForUserUseCase", () => {
  const tenant = {
    id: "t1",
    kind: TenantKind.INDIVIDUAL,
    status: TenantStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let ensurePersonalTenantForUser: ReturnType<typeof vi.fn>;
  let listUserIdsMissingPersonalTenant: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
    ensurePersonalTenantForUser = vi.fn().mockResolvedValue({
      tenant,
      created: true,
    });
    listUserIdsMissingPersonalTenant = vi.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
  });

  function deps() {
    return {
      tenantRepository: {
        ensurePersonalTenantForUser,
        listUserIdsMissingPersonalTenant,
        findById: vi.fn(),
      } as never,
    };
  }

  it("no-ops when the foundation flag is OFF", async () => {
    const result = await ensurePersonalTenantForUserUseCase("u1", deps());
    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "flag_off",
    });
    expect(ensurePersonalTenantForUser).not.toHaveBeenCalled();
  });

  it("provisions when force=true even if flag is OFF", async () => {
    const result = await ensurePersonalTenantForUserUseCase("u1", deps(), {
      force: true,
    });
    expect(result).toEqual({
      ok: true,
      skipped: false,
      tenant,
      created: true,
    });
    expect(ensurePersonalTenantForUser).toHaveBeenCalledWith("u1", {
      force: true,
    });
  });

  it("provisions when flag is ON", async () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";
    ensurePersonalTenantForUser.mockResolvedValue({
      tenant,
      created: false,
    });
    const result = await ensurePersonalTenantForUserUseCase("u1", deps());
    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.created).toBe(false);
      expect(result.tenant.id).toBe("t1");
    }
    expect(ensurePersonalTenantForUser).toHaveBeenCalledWith("u1", {
      force: false,
    });
  });

  it("backfill is idempotent-friendly and skips when flag off without force", async () => {
    const skipped = await backfillPersonalTenantsUseCase(deps());
    expect(skipped).toEqual({
      processed: 0,
      created: 0,
      skippedFlag: true,
    });

    listUserIdsMissingPersonalTenant
      .mockResolvedValueOnce(["u1", "u2"])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    ensurePersonalTenantForUser
      .mockResolvedValueOnce({ tenant, created: true })
      .mockResolvedValueOnce({
        tenant: { ...tenant, id: "t2" },
        created: true,
      });

    const ran = await backfillPersonalTenantsUseCase(deps(), { force: true });
    expect(ran.processed).toBe(2);
    expect(ran.created).toBe(2);
    expect(ran.skippedFlag).toBe(false);
    expect(ensurePersonalTenantForUser).toHaveBeenCalledWith("u1", {
      force: true,
    });
  });

  it("backfill fails when users remain after maxBatches", async () => {
    listUserIdsMissingPersonalTenant.mockResolvedValue(["u1"]);
    ensurePersonalTenantForUser.mockResolvedValue({ tenant, created: true });

    await expect(
      backfillPersonalTenantsUseCase(deps(), {
        force: true,
        batchSize: 1,
        maxBatches: 2,
      }),
    ).rejects.toThrow(/Backfill incomplete/);
  });
});
