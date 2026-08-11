import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertCreateAuthorization,
  createOrganizationUseCase,
} from "@/application/use-cases/organizations/create-organization";
import {
  OrganizationMembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  OrganizationType,
  TenantKind,
  TenantStatus,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import {
  FOUNDATION_ORGS_V1_FLAG,
  FOUNDATION_PROFESSIONAL_V1_FLAG,
  FOUNDATION_TENANT_V1_FLAG,
  isFoundationOrgsV1Enabled,
} from "@/lib/feature-flags";

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
  const organization = {
    id: "org_1",
    type: OrganizationType.LAW_FIRM,
    name: "Acme Law",
    status: OrganizationStatus.ACTIVE,
    tenantId: "ten_org_1",
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const membership = {
    id: "mem_1",
    organizationId: "org_1",
    userId: "user_lawyer",
    orgRole: OrganizationRole.OWNER,
    status: OrganizationMembershipStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const tenant = {
    id: "ten_org_1",
    kind: TenantKind.ORGANIZATION,
    status: TenantStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let createWithFoundingOwner: ReturnType<typeof vi.fn>;
  let runInTransaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env[FOUNDATION_ORGS_V1_FLAG];
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
    delete process.env[FOUNDATION_PROFESSIONAL_V1_FLAG];

    createWithFoundingOwner = vi.fn().mockResolvedValue({
      organization,
      membership,
      tenant,
    });
    runInTransaction = vi.fn(async (work) =>
      work({
        organizationRepository: { createWithFoundingOwner },
      } as never),
    );
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

  it("throws when flag is OFF", async () => {
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

  it("passes full actor context to the sole create path", async () => {
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
    expect(createWithFoundingOwner).toHaveBeenCalledWith({
      actorUserId: "user_lawyer",
      actorRole: UserRole.LAWYER,
      type: OrganizationType.LAW_FIRM,
      name: "  Acme Law  ",
      foundingOwnerUserId: undefined,
    });
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
