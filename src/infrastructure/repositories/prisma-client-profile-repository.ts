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
import { prisma } from "@/infrastructure/database/prisma";

export class PrismaClientProfileRepository implements ClientProfileRepository {
  async findById(id: string): Promise<ClientProfile | null> {
    const record = await prisma.clientProfile.findFirst({
      where: { id, deletedAt: null },
      select: clientProfileSelect,
    });
    return record ? mapClientProfile(record) : null;
  }

  async findByUserId(userId: string): Promise<ClientProfile | null> {
    const record = await prisma.clientProfile.findFirst({
      where: { userId, deletedAt: null },
      select: clientProfileSelect,
    });
    return record ? mapClientProfile(record) : null;
  }

  async create(input: CreateClientProfileInput): Promise<ClientProfile> {
    const record = await prisma.clientProfile.create({
      data: {
        userId: input.userId,
        phone: input.phone,
        companyName: input.companyName,
      },
      select: clientProfileSelect,
    });
    return mapClientProfile(record);
  }

  async update(
    id: string,
    input: UpdateClientProfileInput,
  ): Promise<ClientProfile> {
    const record = await prisma.clientProfile.update({
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
