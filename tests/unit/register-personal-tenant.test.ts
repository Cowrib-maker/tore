import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { provisionPersonalTenantOnRegister } from "@/application/use-cases/auth/provision-personal-tenant-on-register";
import { registerClientUseCase } from "@/application/use-cases/auth/register-client";
import { registerLawyerUseCase } from "@/application/use-cases/auth/register-lawyer";
import { ensurePersonalTenantForUserUseCase } from "@/application/use-cases/tenancy/ensure-personal-tenant";
import type { Tenant } from "@/domain/entities/tenant";
import type { User } from "@/domain/entities/user";
import {
  TenantKind,
  TenantStatus,
  UserRole,
  UserStatus,
} from "@/domain/enums";
import type { UnitOfWorkRepositories } from "@/domain/ports/unit-of-work";
import { FOUNDATION_TENANT_V1_FLAG } from "@/lib/feature-flags";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_1",
    email: "client@example.com",
    emailVerified: null,
    name: "Test User",
    image: null,
    role: UserRole.CLIENT,
    status: UserStatus.ACTIVE,
    preferredLanguage: "mn",
    personalTenantId: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makeTenant(id = "ten_personal_1"): Tenant {
  return {
    id,
    kind: TenantKind.INDIVIDUAL,
    status: TenantStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

const registerInput = {
  name: "Test User",
  email: "new@example.com",
  password: "Password1!",
  acceptTerms: true as const,
  preferredLanguage: "mn" as const,
};

describe("registration personal tenant provisioning", () => {
  let ensurePersonalTenantForUser: ReturnType<typeof vi.fn>;
  let createUser: ReturnType<typeof vi.fn>;
  let createClientProfile: ReturnType<typeof vi.fn>;
  let createLawyerProfile: ReturnType<typeof vi.fn>;
  let createBundle: ReturnType<typeof vi.fn>;
  let createAudit: ReturnType<typeof vi.fn>;
  let emailExists: ReturnType<typeof vi.fn>;
  let findManySettings: ReturnType<typeof vi.fn>;
  let transactionCommitted: boolean;

  beforeEach(() => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
    transactionCommitted = false;
    ensurePersonalTenantForUser = vi.fn();
    createUser = vi.fn().mockImplementation(async (input) =>
      makeUser({
        id: "user_new",
        email: input.email,
        name: input.name,
        role: input.role,
        preferredLanguage: input.preferredLanguage ?? "mn",
        personalTenantId: null,
      }),
    );
    createClientProfile = vi.fn().mockResolvedValue({});
    createLawyerProfile = vi.fn().mockResolvedValue({
      id: "lp_1",
      userId: "user_new",
      slug: "test-user",
    });
    createBundle = vi.fn().mockResolvedValue(undefined);
    createAudit = vi.fn().mockResolvedValue(undefined);
    emailExists = vi.fn().mockResolvedValue(false);
    findManySettings = vi.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
  });

  function repos(): UnitOfWorkRepositories {
    return {
      userRepository: {
        create: createUser,
        emailExists,
      } as never,
      tenantRepository: {
        ensurePersonalTenantForUser,
        findById: vi.fn(),
        listUserIdsMissingPersonalTenant: vi.fn(),
      } as never,
      organizationRepository: {} as never,
      clientProfileRepository: {
        create: createClientProfile,
      } as never,
      lawyerProfileRepository: {
        create: createLawyerProfile,
        slugExists: vi.fn().mockResolvedValue(false),
      } as never,
      lawyerCredentialRepository: {} as never,
      termsAcceptanceRepository: {
        createBundle,
      } as never,
      bookingRepository: {} as never,
      auditLogRepository: {
        create: createAudit,
      } as never,
      notificationRepository: {} as never,
    };
  }

  function deps() {
    return {
      userRepository: {
        emailExists,
      } as never,
      platformSettingRepository: {
        findMany: findManySettings,
      } as never,
      unitOfWork: {
        runInTransaction: async <T>(
          work: (r: UnitOfWorkRepositories) => Promise<T>,
        ): Promise<T> => {
          const result = await work(repos());
          transactionCommitted = true;
          return result;
        },
      },
    };
  }

  it("TEST 1 · flag OFF · CLIENT registration leaves personalTenantId null", async () => {
    const user = await registerClientUseCase(registerInput, deps());
    expect(user.role).toBe(UserRole.CLIENT);
    expect(user.personalTenantId).toBeNull();
    expect(ensurePersonalTenantForUser).not.toHaveBeenCalled();
    expect(createClientProfile).toHaveBeenCalled();
    expect(transactionCommitted).toBe(true);
  });

  it("TEST 2 · flag OFF · LAWYER registration leaves personalTenantId null", async () => {
    const user = await registerLawyerUseCase(registerInput, deps());
    expect(user.role).toBe(UserRole.LAWYER);
    expect(user.personalTenantId).toBeNull();
    expect(ensurePersonalTenantForUser).not.toHaveBeenCalled();
    expect(createLawyerProfile).toHaveBeenCalled();
    expect(transactionCommitted).toBe(true);
  });

  it("TEST 3 · flag ON · CLIENT registration links personalTenantId", async () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";
    const tenant = makeTenant("ten_client");
    ensurePersonalTenantForUser.mockResolvedValue({ tenant, created: true });

    const user = await registerClientUseCase(registerInput, deps());
    expect(user.personalTenantId).toBe("ten_client");
    expect(ensurePersonalTenantForUser).toHaveBeenCalledWith("user_new", {
      force: false,
    });
    expect(transactionCommitted).toBe(true);
  });

  it("TEST 4 · flag ON · LAWYER registration links personalTenantId", async () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";
    const tenant = makeTenant("ten_lawyer");
    ensurePersonalTenantForUser.mockResolvedValue({ tenant, created: true });

    const user = await registerLawyerUseCase(registerInput, deps());
    expect(user.personalTenantId).toBe("ten_lawyer");
    expect(ensurePersonalTenantForUser).toHaveBeenCalledWith("user_new", {
      force: false,
    });
    expect(transactionCommitted).toBe(true);
  });

  it("TEST 7 · flag ON · tenant provisioning failure aborts registration", async () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";
    ensurePersonalTenantForUser.mockRejectedValue(
      new Error("tenant create failed"),
    );

    await expect(
      registerClientUseCase(registerInput, deps()),
    ).rejects.toThrow(/tenant create failed/);
    expect(transactionCommitted).toBe(false);
  });
});

describe("ensurePersonalTenant idempotency + concurrency", () => {
  afterEach(() => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
  });

  it("TEST 5 · calling ensure twice returns the same personal tenant", async () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";
    const tenant = makeTenant("ten_same");
    const ensurePersonalTenantForUser = vi
      .fn()
      .mockResolvedValueOnce({ tenant, created: true })
      .mockResolvedValueOnce({ tenant, created: false });

    const deps = {
      tenantRepository: {
        ensurePersonalTenantForUser,
        findById: vi.fn(),
        listUserIdsMissingPersonalTenant: vi.fn(),
      } as never,
    };

    const first = await ensurePersonalTenantForUserUseCase("u1", deps);
    const second = await ensurePersonalTenantForUserUseCase("u1", deps);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(false);
    if (!first.skipped && !second.skipped) {
      expect(first.tenant.id).toBe(second.tenant.id);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
    }
  });

  it("TEST 6 · concurrent ensure attempts resolve to one personal tenant", async () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";

    // Simulates DB uniqueness + conditional link: only one create wins.
    const byUser = new Map<string, Tenant>();
    let chain = Promise.resolve();

    const ensurePersonalTenantForUser = vi.fn(
      async (userId: string): Promise<{ tenant: Tenant; created: boolean }> => {
        const run = chain.then(async () => {
          const existing = byUser.get(userId);
          if (existing) {
            return { tenant: existing, created: false };
          }
          // Yield so concurrent callers queue before the first write lands.
          await Promise.resolve();
          const again = byUser.get(userId);
          if (again) {
            return { tenant: again, created: false };
          }
          const tenant = makeTenant(`ten_${byUser.size + 1}`);
          byUser.set(userId, tenant);
          return { tenant, created: true };
        });
        chain = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      },
    );

    const deps = {
      tenantRepository: {
        ensurePersonalTenantForUser,
        findById: vi.fn(),
        listUserIdsMissingPersonalTenant: vi.fn(),
      } as never,
    };

    const [a, b, c] = await Promise.all([
      ensurePersonalTenantForUserUseCase("u_race", deps),
      ensurePersonalTenantForUserUseCase("u_race", deps),
      ensurePersonalTenantForUserUseCase("u_race", deps),
    ]);

    expect(byUser.size).toBe(1);
    const ids = [a, b, c].map((r) => {
      expect(r.skipped).toBe(false);
      return r.skipped ? null : r.tenant.id;
    });
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe("ten_1");
  });
});

describe("provisionPersonalTenantOnRegister helper", () => {
  afterEach(() => {
    delete process.env[FOUNDATION_TENANT_V1_FLAG];
  });

  it("returns the same user when flag is OFF", async () => {
    const user = makeUser();
    const ensurePersonalTenantForUser = vi.fn();
    const result = await provisionPersonalTenantOnRegister(user, {
      ensurePersonalTenantForUser,
      findById: vi.fn(),
      listUserIdsMissingPersonalTenant: vi.fn(),
    } as never);
    expect(result).toEqual(user);
    expect(result.personalTenantId).toBeNull();
    expect(ensurePersonalTenantForUser).not.toHaveBeenCalled();
  });

  it("attaches personalTenantId when flag is ON", async () => {
    process.env[FOUNDATION_TENANT_V1_FLAG] = "1";
    const user = makeUser();
    const tenant = makeTenant("ten_attach");
    const ensurePersonalTenantForUser = vi
      .fn()
      .mockResolvedValue({ tenant, created: true });
    const result = await provisionPersonalTenantOnRegister(user, {
      ensurePersonalTenantForUser,
      findById: vi.fn(),
      listUserIdsMissingPersonalTenant: vi.fn(),
    } as never);
    expect(result.personalTenantId).toBe("ten_attach");
  });
});
