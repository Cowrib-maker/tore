import type { User } from "@/domain/entities/user";
import type { UserRepository } from "@/domain/repositories/user-repository";
import type {
  CreateUserInput,
  UpdateUserProfileInput,
} from "@/domain/entities/user";
import { UserStatus } from "@/domain/enums";
import type { UserRole } from "@/domain/enums";
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
      },
      select: userSelect,
    });
    return mapUser(record);
  }
}

export const userRepository = new PrismaUserRepository();
