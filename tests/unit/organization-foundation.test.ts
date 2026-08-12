import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertCreateAuthorization,
  createOrganizationUseCase,
} from "@/application/use-cases/organizations/create-organization";
import { getMyOrganizationOverviewUseCase } from "@/application/use-cases/organizations/get-my-organization-overview";
import { listMyOrganizationsUseCase } from "@/application/use-cases/organizations/list-my-organizations";
import {
  OrganizationMembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  OrganizationType,
  TenantKind,
  TenantStatus,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import {
  assertOrganizationOwner,
  requireActiveOrganizationMembership,
} from "@/domain/services/organization-membership-authz";
import {
  FOUNDATION_ORGS_V1_FLAG,
  FOUNDATION_PROFESSIONAL_V1_FLAG,
  FOUNDATION_TENANT_V1_FLAG,
  isFoundationOrgsV1Enabled,
} from "@/lib/feature-flags";

const organization = {
  id: "org_1",
  type: OrganizationType.LAW_FIRM,
  name: "Acme Law",
  status: OrganizationStatus.ACTIVE,
  tenantId: "ten_org_1",
  deletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const membership = {
  id: "mem_1",
  organizationId: "org_1",
  userId: "user_lawyer",
  orgRole: OrganizationRole.OWNER,
  status: OrganizationMembershipStatus.ACTIVE,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const tenant = {
  id: "ten_org_1",
  kind: TenantKind.ORGANIZATION,
  status: TenantStatus.ACTIVE,
  deletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("foundation orgs feature flag", () => {
  afterEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
  });

  it("defaults to OFF when unset", () => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
    expect(isFoundationOrgsV1Enabled()).toBe(false);
  });

  it("enables only when exactly 1", () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    expect(isFoundationOrgsV1Enabled()).toBe(true);
    process.env[FOUNDATION_ORGS_V1_FLAG] = "true";
    expect(isFoundationOrgsV1Enabled()).toBe(false);
  });
});

describe("assertCreateAuthorization matrix", () => {
  it("allows ADMIN for both types", () => {
    expect(() =>
      assertCreateAuthorization(UserRole.ADMIN, OrganizationType.LAW_FIRM),
    ).not.toThrow();
    expect(() =>
      assertCreateAuthorization(UserRole.ADMIN, OrganizationType.LEGAL_ENTITY),
    ).not.toThrow();
  });

  it("allows LAWYER only for LAW_FIRM", () => {
    expect(() =>
      assertCreateAuthorization(UserRole.LAWYER, OrganizationType.LAW_FIRM),
    ).not.toThrow();
    expect(() =>
      assertCreateAuthorization(UserRole.LAWYER, OrganizationType.LEGAL_ENTITY),
    ).toThrow(ForbiddenError);
  });

  it("allows CLIENT only for LEGAL_ENTITY", () => {
    expect(() =>
      assertCreateAuthorization(UserRole.CLIENT, OrganizationType.LEGAL_ENTITY),
    ).not.toThrow();
    expect(() =>
      assertCreateAuthorization(UserRole.CLIENT, OrganizationType.LAW_FIRM),
    ).toThrow(ForbiddenError);
  });
});

describe("createOrganizationUseCase", () => {
  let createWithFoundingOwner: ReturnType<typeof vi.fn>;
  let runInTransaction: ReturnType<typeof vi.fn>;
  let transactionCommitted: boolean;

  beforeEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
    delete process.env[FOUNDATION_PROFESSIONAL_V1_FLAG];
    transactionCommitted = false;

    createWithFoundingOwner = vi.fn().mockResolvedValue({
      organization,
      membership,
      tenant,
    });
    runInTransaction = vi.fn(async (work) => {
      const result = await work({
        organizationRepository: { createWithFoundingOwner },
      } as never);
      transactionCommitted = true;
      return result;
    });
  });

  afterEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
    delete process.env[FOUNDATION_PROFESSIONAL_V1_FLAG];
  });

  function deps() {
    return {
      unitOfWork: { runInTransaction },
    };
  }

  it("TEST 12 · throws when flag is OFF", async () => {
    await expect(
      createOrganizationUseCase(
        {
          actorUserId: "user_lawyer",
          actorRole: UserRole.LAWYER,
          type: OrganizationType.LAW_FIRM,
          name: "Acme Law",
        },
        deps(),
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(createWithFoundingOwner).not.toHaveBeenCalled();
  });

  it("TEST 1–3 · creates org + ORGANIZATION tenant + founding OWNER", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";

    const result = await createOrganizationUseCase(
      {
        actorUserId: "user_lawyer",
        actorRole: UserRole.LAWYER,
        type: OrganizationType.LAW_FIRM,
        name: "  Acme Law  ",
      },
      deps(),
    );

    expect(result.organization.id).toBe("org_1");
    expect(result.tenant.kind).toBe(TenantKind.ORGANIZATION);
    expect(result.membership.orgRole).toBe(OrganizationRole.OWNER);
    expect(result.membership.userId).toBe("user_lawyer");
    expect(createWithFoundingOwner).toHaveBeenCalledWith({
      actorUserId: "user_lawyer",
      actorRole: UserRole.LAWYER,
      type: OrganizationType.LAW_FIRM,
      name: "  Acme Law  ",
      foundingOwnerUserId: undefined,
    });
    expect(transactionCommitted).toBe(true);
  });

  it("TEST 10 · LAW_FIRM create path works for lawyer", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    await createOrganizationUseCase(
      {
        actorUserId: "user_lawyer",
        actorRole: UserRole.LAWYER,
        type: OrganizationType.LAW_FIRM,
        name: "Firm",
      },
      deps(),
    );
    expect(createWithFoundingOwner).toHaveBeenCalled();
  });

  it("TEST 11 · LEGAL_ENTITY create path works for client", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    createWithFoundingOwner.mockResolvedValue({
      organization: {
        ...organization,
        type: OrganizationType.LEGAL_ENTITY,
        id: "org_sme",
      },
      membership: {
        ...membership,
        organizationId: "org_sme",
        userId: "user_client",
      },
      tenant: { ...tenant, id: "ten_sme" },
    });

    const result = await createOrganizationUseCase(
      {
        actorUserId: "user_client",
        actorRole: UserRole.CLIENT,
        type: OrganizationType.LEGAL_ENTITY,
        name: "SME Co",
      },
      deps(),
    );
    expect(result.organization.type).toBe(OrganizationType.LEGAL_ENTITY);
    expect(result.membership.orgRole).toBe(OrganizationRole.OWNER);
  });

  it("TEST 4–5 · failed create does not commit transaction", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    createWithFoundingOwner.mockRejectedValue(new Error("db failed"));

    await expect(
      createOrganizationUseCase(
        {
          actorUserId: "user_lawyer",
          actorRole: UserRole.LAWYER,
          type: OrganizationType.LAW_FIRM,
          name: "Broken",
        },
        deps(),
      ),
    ).rejects.toThrow(/db failed/);
    expect(transactionCommitted).toBe(false);
  });

  it("does not require Tenant or Professional flags", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
    delete process.env[FOUNDATION_PROFESSIONAL_V1_FLAG];

    await createOrganizationUseCase(
      {
        actorUserId: "user_lawyer",
        actorRole: UserRole.LAWYER,
        type: OrganizationType.LAW_FIRM,
        name: "Solo Firm",
      },
      deps(),
    );
    expect(createWithFoundingOwner).toHaveBeenCalled();
  });

  it("forwards admin designation to repository (matrix enforced there)", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";

    await createOrganizationUseCase(
      {
        actorUserId: "admin_1",
        actorRole: UserRole.ADMIN,
        type: OrganizationType.LEGAL_ENTITY,
        name: "SME Co",
        foundingOwnerUserId: "other_user",
      },
      deps(),
    );

    expect(createWithFoundingOwner).toHaveBeenCalledWith({
      actorUserId: "admin_1",
      actorRole: UserRole.ADMIN,
      type: OrganizationType.LEGAL_ENTITY,
      name: "SME Co",
      foundingOwnerUserId: "other_user",
    });
  });
});

describe("listMyOrganizationsUseCase", () => {
  let listActiveMembershipsForUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
    listActiveMembershipsForUser = vi.fn().mockResolvedValue([
      { organization, membership },
    ]);
  });

  afterEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
  });

  function deps() {
    return {
      organizationRepository: {
        listActiveMembershipsForUser,
        findActiveMembershipForUser: vi.fn(),
        createWithFoundingOwner: vi.fn(),
        findById: vi.fn(),
        findByTenantId: vi.fn(),
      } as never,
    };
  }

  it("TEST 12 · flag OFF rejects list", async () => {
    await expect(
      listMyOrganizationsUseCase(
        { userId: "user_lawyer", role: UserRole.LAWYER },
        deps(),
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(listActiveMembershipsForUser).not.toHaveBeenCalled();
  });

  it("TEST 6 · returns only membership-scoped organizations", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    const result = await listMyOrganizationsUseCase(
      { userId: "user_lawyer", role: UserRole.LAWYER },
      deps(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.organization.id).toBe("org_1");
    expect(listActiveMembershipsForUser).toHaveBeenCalledWith("user_lawyer");
  });

  it("TEST 7 · empty list when user has no memberships", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    listActiveMembershipsForUser.mockResolvedValue([]);
    const result = await listMyOrganizationsUseCase(
      { userId: "user_other", role: UserRole.CLIENT },
      deps(),
    );
    expect(result).toEqual([]);
  });
});

describe("getMyOrganizationOverviewUseCase", () => {
  let findActiveMembershipForUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
    findActiveMembershipForUser = vi.fn().mockResolvedValue({
      organization,
      membership,
    });
  });

  afterEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
  });

  function deps() {
    return {
      organizationRepository: {
        findActiveMembershipForUser,
        listActiveMembershipsForUser: vi.fn(),
        createWithFoundingOwner: vi.fn(),
        findById: vi.fn(),
        findByTenantId: vi.fn(),
      } as never,
    };
  }

  it("TEST 8 · member can access overview", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    const result = await getMyOrganizationOverviewUseCase(
      { userId: "user_lawyer", role: UserRole.LAWYER },
      "org_1",
      deps(),
    );
    expect(result.organization.name).toBe("Acme Law");
    expect(result.membership.orgRole).toBe(OrganizationRole.OWNER);
  });

  it("TEST 9 · non-member access is NotFound (IDOR-safe)", async () => {
    process.env[FOUNDATION_ORGS_V1_FLAG] = "1";
    findActiveMembershipForUser.mockResolvedValue(null);
    await expect(
      getMyOrganizationOverviewUseCase(
        { userId: "user_stranger", role: UserRole.CLIENT },
        "org_1",
        deps(),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("TEST 13 · flag OFF rejects overview", async () => {
    await expect(
      getMyOrganizationOverviewUseCase(
        { userId: "user_lawyer", role: UserRole.LAWYER },
        "org_1",
        deps(),
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("organization membership authz helpers", () => {
  it("requireActiveOrganizationMembership rejects null with NotFound", () => {
    expect(() =>
      requireActiveOrganizationMembership(null, "org_missing"),
    ).toThrow(NotFoundError);
  });

  it("assertOrganizationOwner allows OWNER only", () => {
    expect(() => assertOrganizationOwner(membership)).not.toThrow();
    expect(() =>
      assertOrganizationOwner({
        ...membership,
        orgRole: OrganizationRole.MEMBER,
      }),
    ).toThrow(NotFoundError);
  });
});
