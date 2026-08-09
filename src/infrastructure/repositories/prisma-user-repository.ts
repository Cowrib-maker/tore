import type { User } from "@/domain/entities/user";
import type { UserRepository } from "@/domain/repositories/user-repository";
import type { CreateUserInput } from "@/domain/entities/user";
import { UserStatus } from "@/domain/enums";
import type { UserRole } from "@/domain/enums";
import { mapUser, userSelect } from "@/infrastructure/mappers/user.mapper";
import { prisma } from "@/infrastructure/database/prisma";

export class PrismaUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const record = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    return record ? mapUser(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: userSelect,
    });
    return record ? mapUser(record) : null;
  }

  async findByEmailWithPasswordHash(
    email: string,
  ): Promise<{ user: User; passwordHash: string } | null> {
    const record = await prisma.user.findFirst({
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
    const record = await prisma.user.create({
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
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await prisma.user.count({
      where: { email, deletedAt: null },
    });
    return count > 0;
  }

  async isActiveUser(id: string): Promise<boolean> {
    const record = await prisma.user.findFirst({
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
    const records = await prisma.user.findMany({
      where: { role, deletedAt: null },
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapUser);
  }
}

export const userRepository = new PrismaUserRepository();
