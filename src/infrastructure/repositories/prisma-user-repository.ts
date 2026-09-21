import type { User } from "@/domain/entities/user";
import type {
  ListUsersInput,
  ListUsersResult,
  PlatformUserCounts,
  UserRepository,
  AuthPrincipal,
} from "@/domain/repositories/user-repository";
import type {
  CreateUserInput,
  UpdateUserProfileInput,
} from "@/domain/entities/user";
import { UserRole, UserStatus } from "@/domain/enums";
import { mapUser, userSelect } from "@/infrastructure/mappers/user.mapper";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import { mapUniqueViolation } from "@/infrastructure/database/prisma-errors";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.db.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    return record ? mapUser(record) : null;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const records = await this.db.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: userSelect,
    });
    return records.map(mapUser);
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.db.user.findFirst({
      where: { email, deletedAt: null },
      select: userSelect,
    });
    return record ? mapUser(record) : null;
  }

  async findByEmailWithPasswordHash(
    email: string,
  ): Promise<{ user: User; passwordHash: string } | null> {
    const record = await this.db.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        ...userSelect,
        passwordHash: true,
      },
    });

    if (!record?.passwordHash) {
      return null;
    }

    const { passwordHash, ...userFields } = record;
    return {
      user: mapUser(userFields),
      passwordHash,
    };
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      const record = await this.db.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          role: input.role,
          status: UserStatus.ACTIVE,
          preferredLanguage: input.preferredLanguage ?? "mn",
        },
        select: userSelect,
      });
      return mapUser(record);
    } catch (error) {
      mapUniqueViolation(error, "An account with this email already exists");
    }
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await this.db.user.count({
      where: { email, deletedAt: null },
    });
    return count > 0;
  }

  async isActiveUser(id: string): Promise<boolean> {
    const record = await this.db.user.findFirst({
      where: {
        id,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    return record !== null;
  }

  async findByRole(role: UserRole): Promise<User[]> {
    const records = await this.db.user.findMany({
      where: { role, deletedAt: null },
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapUser);
  }

  async markEmailVerified(
    userId: string,
    verifiedAt: Date = new Date(),
  ): Promise<User> {
    const record = await this.db.user.update({
      where: { id: userId },
      data: { emailVerified: verifiedAt },
      select: userSelect,
    });
    return mapUser(record);
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<User> {
    const record = await this.db.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: userSelect,
    });
    return mapUser(record);
  }

  async updateProfile(
    userId: string,
    input: UpdateUserProfileInput,
  ): Promise<User> {
    const record = await this.db.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.image !== undefined ? { image: input.image } : {}),
      },
      select: userSelect,
    });
    return mapUser(record);
  }

  async listUsers(input: ListUsersInput): Promise<ListUsersResult> {
    const where = {
      deletedAt: null,
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { email: { contains: input.search, mode: "insensitive" as const } },
              { name: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.db.user.count({ where }),
    ]);

    return { items: records.map(mapUser), total };
  }

  async getPlatformUserCounts(): Promise<PlatformUserCounts> {
    const where = { deletedAt: null };
    const [total, byRoleRaw, byStatusRaw] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.groupBy({
        by: ["role"],
        where,
        _count: { _all: true },
      }),
      this.db.user.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);

    const byRole = Object.fromEntries(
      Object.values(UserRole).map((role) => [role, 0]),
    ) as Record<UserRole, number>;
    for (const row of byRoleRaw) {
      byRole[row.role as UserRole] = row._count._all;
    }

    const byStatus = Object.fromEntries(
      Object.values(UserStatus).map((status) => [status, 0]),
    ) as Record<UserStatus, number>;
    for (const row of byStatusRaw) {
      byStatus[row.status as UserStatus] = row._count._all;
    }

    return { total, byRole, byStatus };
  }

  async updateStatus(userId: string, status: UserStatus): Promise<User> {
    const record = await this.db.user.update({
      where: { id: userId },
      data: { status },
      select: userSelect,
    });
    return mapUser(record);
  }

  async updateRole(userId: string, role: UserRole): Promise<User> {
    const record = await this.db.user.update({
      where: { id: userId },
      data: { role },
      select: userSelect,
    });
    return mapUser(record);
  }

  async updateEmail(userId: string, email: string): Promise<User> {
    try {
      const record = await this.db.user.update({
        where: { id: userId },
        data: { email, emailVerified: null },
        select: userSelect,
      });
      return mapUser(record);
    } catch (error) {
      mapUniqueViolation(error, "An account with this email already exists");
    }
  }

  async findAuthPrincipal(id: string): Promise<AuthPrincipal | null> {
    const record = await this.db.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        role: true,
        status: true,
        activeSessionIdHash: true,
      },
    });
    if (!record) return null;
    return {
      id: record.id,
      role: record.role as UserRole,
      status: record.status as UserStatus,
      activeSessionIdHash: record.activeSessionIdHash,
    };
  }

  async rotateActiveSessionIdHash(
    userId: string,
    sessionIdHash: string,
  ): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { activeSessionIdHash: sessionIdHash },
    });
  }

  async clearActiveSessionIdHash(userId: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { activeSessionIdHash: null },
    });
  }
}

export const userRepository = new PrismaUserRepository();
