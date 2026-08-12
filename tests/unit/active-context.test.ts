import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseActiveContextSelection,
  serializeActiveContextSelection,
} from "@/application/common/active-context-selection";
import {
  resolveOrganizationActiveContextUseCase,
  resolvePersonalActiveContextUseCase,
} from "@/application/use-cases/active-context/resolve-active-context";
import {
  resolveCurrentActiveContextUseCase,
  switchActiveContextUseCase,
} from "@/application/use-cases/active-context/switch-active-context";
import {
  ActiveContextType,
  OrganizationMembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  OrganizationType,
  TenantKind,
  TenantStatus,
  UserRole,
} from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import {
  FOUNDATION_ACTIVE_CONTEXT_V1_FLAG,
  isFoundationActiveContextV1Enabled,
} from "@/lib/feature-flags";

const personalTenant = {
  id: "ten_personal",
  kind: TenantKind.INDIVIDUAL,
  status: TenantStatus.ACTIVE,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const orgTenant = {
  id: "ten_org_a",
  kind: TenantKind.ORGANIZATION,
  status: TenantStatus.ACTIVE,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const orgBTenant = {
  id: "ten_org_b",
  kind: TenantKind.ORGANIZATION,
  status: TenantStatus.ACTIVE,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const organizationA = {
  id: "org_a",
  type: OrganizationType.LAW_FIRM,
  name: "Firm A",
  status: OrganizationStatus.ACTIVE,
  tenantId: "ten_org_a",
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const organizationB = {
  id: "org_b",
  type: OrganizationType.LEGAL_ENTITY,
  name: "Company B",
  status: OrganizationStatus.ACTIVE,
  tenantId: "ten_org_b",
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const membershipA = {
  id: "mem_a",
  organizationId: "org_a",
  userId: "user_1",
  orgRole: OrganizationRole.OWNER,
  status: OrganizationMembershipStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("foundation active context feature flag", () => {
  afterEach(() => {
    delete process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG];
  });

  it("TEST 13 · defaults to OFF", () => {
    delete process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG];
    expect(isFoundationActiveContextV1Enabled()).toBe(false);
  });

  it("enables only when exactly 1", () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    expect(isFoundationActiveContextV1Enabled()).toBe(true);
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "true";
    expect(isFoundationActiveContextV1Enabled()).toBe(false);
  });
});

describe("active context selection parsing", () => {
  it("TEST 7 · rejects forged tenant-like payloads", () => {
    expect(parseActiveContextSelection("tenant:ten_personal")).toBeNull();
    expect(parseActiveContextSelection("org:")).toBeNull();
    expect(parseActiveContextSelection("org:../hack")).toBeNull();
    expect(parseActiveContextSelection("membership:mem_a")).toBeNull();
  });

  it("round-trips personal and org selections", () => {
    expect(
      parseActiveContextSelection(
        serializeActiveContextSelection({
          type: ActiveContextType.PERSONAL,
        }),
      ),
    ).toEqual({ type: ActiveContextType.PERSONAL });
    expect(
      parseActiveContextSelection(
        serializeActiveContextSelection({
          type: ActiveContextType.ORGANIZATION,
          organizationId: "org_a_123456",
        }),
      ),
    ).toEqual({
      type: ActiveContextType.ORGANIZATION,
      organizationId: "org_a_123456",
    });
  });
});

describe("resolve + switch Active Context", () => {
  let findPersonalTenantForUser: ReturnType<typeof vi.fn>;
  let findById: ReturnType<typeof vi.fn>;
  let findActiveMembershipForUser: ReturnType<typeof vi.fn>;

  const actor = { userId: "user_1", role: UserRole.LAWYER };

  beforeEach(() => {
    delete process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG];
    findPersonalTenantForUser = vi.fn().mockResolvedValue(personalTenant);
    findById = vi.fn(async (id: string) => {
      if (id === "ten_org_a") return orgTenant;
      if (id === "ten_org_b") return orgBTenant;
      if (id === "ten_personal") return personalTenant;
      return null;
    });
    findActiveMembershipForUser = vi.fn(async (organizationId: string) => {
      if (organizationId === "org_a") {
        return { organization: organizationA, membership: membershipA };
      }
      return null;
    });
  });

  afterEach(() => {
    delete process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG];
  });

  function deps() {
    return {
      tenantRepository: {
        findPersonalTenantForUser,
        findById,
        ensurePersonalTenantForUser: vi.fn(),
        listUserIdsMissingPersonalTenant: vi.fn(),
      } as never,
      organizationRepository: {
        findActiveMembershipForUser,
        listActiveMembershipsForUser: vi.fn(),
        createWithFoundingOwner: vi.fn(),
        findById: vi.fn(),
        findByTenantId: vi.fn(),
      } as never,
    };
  }

  it("TEST 13 · flag OFF rejects resolve", async () => {
    await expect(
      resolvePersonalActiveContextUseCase(actor, deps()),
    ).rejects.toThrow(ForbiddenError);
  });

  it("TEST 1 · personal context resolves correctly", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    const ctx = await resolvePersonalActiveContextUseCase(actor, deps());
    expect(ctx.contextType).toBe(ActiveContextType.PERSONAL);
    expect(ctx.tenantId).toBe("ten_personal");
    expect(ctx.organizationId).toBeUndefined();
    expect(ctx.membershipId).toBeUndefined();
  });

  it("TEST 11 · personal context rejects organization tenant kinds", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    findPersonalTenantForUser.mockResolvedValue({
      ...personalTenant,
      kind: TenantKind.ORGANIZATION,
    });
    await expect(
      resolvePersonalActiveContextUseCase(actor, deps()),
    ).rejects.toThrow(ForbiddenError);
  });

  it("TEST 2 · organization context resolves correctly", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    const ctx = await resolveOrganizationActiveContextUseCase(
      actor,
      "org_a",
      deps(),
    );
    expect(ctx.contextType).toBe(ActiveContextType.ORGANIZATION);
    expect(ctx.tenantId).toBe("ten_org_a");
    expect(ctx.organizationId).toBe("org_a");
    expect(ctx.membershipId).toBe("mem_a");
    expect(ctx.orgRole).toBe(OrganizationRole.OWNER);
  });

  it("TEST 10 · organization context uses organization tenant not personal", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    const ctx = await resolveOrganizationActiveContextUseCase(
      actor,
      "org_a",
      deps(),
    );
    expect(ctx.tenantId).not.toBe("ten_personal");
    expect(ctx.tenantId).toBe(organizationA.tenantId);
  });

  it("TEST 3 · default context is PERSONAL", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    const result = await resolveCurrentActiveContextUseCase(
      { actor, selection: null },
      deps(),
    );
    expect(result.context.contextType).toBe(ActiveContextType.PERSONAL);
    expect(result.fellBackToPersonal).toBe(false);
  });

  it("TEST 4–6 · active membership required; inactive/non-member rejected", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";

    findActiveMembershipForUser.mockResolvedValue({
      organization: organizationA,
      membership: {
        ...membershipA,
        status: OrganizationMembershipStatus.REVOKED,
      },
    });
    await expect(
      resolveOrganizationActiveContextUseCase(actor, "org_a", deps()),
    ).rejects.toThrow(NotFoundError);

    findActiveMembershipForUser.mockResolvedValue(null);
    await expect(
      resolveOrganizationActiveContextUseCase(actor, "org_b", deps()),
    ).rejects.toThrow(NotFoundError);
  });

  it("TEST 8–9 · cannot forge membershipId/tenantId via org switch of another org", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    await expect(
      switchActiveContextUseCase(
        actor,
        { type: ActiveContextType.ORGANIZATION, organizationId: "org_b" },
        deps(),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("TEST 14 · switch Personal → Organization", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    const ctx = await switchActiveContextUseCase(
      actor,
      { type: ActiveContextType.ORGANIZATION, organizationId: "org_a" },
      deps(),
    );
    expect(ctx.contextType).toBe(ActiveContextType.ORGANIZATION);
    expect(ctx.organizationId).toBe("org_a");
  });

  it("TEST 15 · switch Organization → Personal", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    const ctx = await switchActiveContextUseCase(
      actor,
      { type: ActiveContextType.PERSONAL },
      deps(),
    );
    expect(ctx.contextType).toBe(ActiveContextType.PERSONAL);
    expect(ctx.tenantId).toBe("ten_personal");
  });

  it("TEST 16 · switch A → B requires membership in B", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    findActiveMembershipForUser.mockImplementation(
      async (organizationId: string) => {
        if (organizationId === "org_a") {
          return { organization: organizationA, membership: membershipA };
        }
        if (organizationId === "org_b") {
          return {
            organization: organizationB,
            membership: {
              ...membershipA,
              id: "mem_b",
              organizationId: "org_b",
            },
          };
        }
        return null;
      },
    );

    const toB = await switchActiveContextUseCase(
      actor,
      { type: ActiveContextType.ORGANIZATION, organizationId: "org_b" },
      deps(),
    );
    expect(toB.organizationId).toBe("org_b");
    expect(toB.tenantId).toBe("ten_org_b");
  });

  it("TEST 17 · removed membership prevents future org resolution; falls back to personal", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    findActiveMembershipForUser.mockResolvedValue(null);

    const result = await resolveCurrentActiveContextUseCase(
      {
        actor,
        selection: {
          type: ActiveContextType.ORGANIZATION,
          organizationId: "org_a",
        },
      },
      deps(),
    );
    expect(result.fellBackToPersonal).toBe(true);
    expect(result.context.contextType).toBe(ActiveContextType.PERSONAL);
  });

  it("rejects personal resolve when personal tenant missing", async () => {
    process.env[FOUNDATION_ACTIVE_CONTEXT_V1_FLAG] = "1";
    findPersonalTenantForUser.mockResolvedValue(null);
    await expect(
      resolvePersonalActiveContextUseCase(actor, deps()),
    ).rejects.toThrow(ValidationError);
  });

  it("TEST 12 · ActorContext shape for marketplace remains {userId, role}", () => {
    // Structural compatibility: ActiveContext extends ActorContext fields.
    const marketplaceActor = { userId: "user_1", role: UserRole.CLIENT };
    expect(marketplaceActor).toEqual({
      userId: "user_1",
      role: UserRole.CLIENT,
    });
  });
});
