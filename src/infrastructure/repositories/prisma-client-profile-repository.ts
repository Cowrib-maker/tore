import type {
  ClientProfile,
  CreateClientProfileInput,
  UpdateClientProfileInput,
} from "@/domain/entities/profile";
import type { ClientProfileRepository } from "@/domain/repositories/profile-repository";
import {
  clientProfileSelect,
  mapClientProfile,
} from "@/infrastructure/mappers/profile.mapper";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import { mapUniqueViolation } from "@/infrastructure/database/prisma-errors";

export class PrismaClientProfileRepository implements ClientProfileRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<ClientProfile | null> {
    const record = await this.db.clientProfile.findFirst({
      where: { id, deletedAt: null },
      select: clientProfileSelect,
    });
    return record ? mapClientProfile(record) : null;
  }

  async findByUserId(userId: string): Promise<ClientProfile | null> {
    const record = await this.db.clientProfile.findFirst({
      where: { userId, deletedAt: null },
      select: clientProfileSelect,
    });
    return record ? mapClientProfile(record) : null;
  }

  async create(input: CreateClientProfileInput): Promise<ClientProfile> {
    try {
      const record = await this.db.clientProfile.create({
        data: {
          userId: input.userId,
          phone: input.phone,
          companyName: input.companyName,
        },
        select: clientProfileSelect,
      });
      return mapClientProfile(record);
    } catch (error) {
      mapUniqueViolation(error, "Client profile already exists for this user");
    }
  }

  async update(
    id: string,
    input: UpdateClientProfileInput,
  ): Promise<ClientProfile> {
    const record = await this.db.clientProfile.update({
      where: { id },
      data: {
        phone: input.phone,
        companyName: input.companyName,
      },
      select: clientProfileSelect,
    });
    return mapClientProfile(record);
  }
}

export const clientProfileRepository = new PrismaClientProfileRepository();
