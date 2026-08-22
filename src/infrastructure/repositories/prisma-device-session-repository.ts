import type {
  CreateDeviceSessionInput,
  DeviceSession,
  TouchDeviceSessionInput,
} from "@/domain/entities/subscription";
import { DeviceSessionStatus } from "@/domain/enums";
import type { DeviceSessionRepository } from "@/domain/repositories/device-session-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import { mapDeviceSession } from "@/infrastructure/mappers/subscription.mapper";

export class PrismaDeviceSessionRepository implements DeviceSessionRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(input: CreateDeviceSessionInput): Promise<DeviceSession> {
    const record = await this.db.deviceSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        subscriptionId: input.subscriptionId ?? null,
        userAgent: input.userAgent ?? null,
        ipHash: input.ipHash ?? null,
        firstSeenAt: input.firstSeenAt,
        lastSeenAt: input.lastSeenAt,
        status: DeviceSessionStatus.ACTIVE,
        requestCountWindowStart:
          input.requestCountWindowStart ?? input.lastSeenAt,
        requestCountInWindow: input.requestCountInWindow ?? 1,
      },
    });
    return mapDeviceSession(record);
  }

  async findById(id: string): Promise<DeviceSession | null> {
    const record = await this.db.deviceSession.findUnique({ where: { id } });
    return record ? mapDeviceSession(record) : null;
  }

  async listByUserId(userId: string): Promise<DeviceSession[]> {
    const records = await this.db.deviceSession.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
    return records.map(mapDeviceSession);
  }

  async listActiveByUserId(userId: string): Promise<DeviceSession[]> {
    const records = await this.db.deviceSession.findMany({
      where: { userId, status: DeviceSessionStatus.ACTIVE },
      orderBy: { lastSeenAt: "desc" },
    });
    return records.map(mapDeviceSession);
  }

  async touch(id: string, input: TouchDeviceSessionInput): Promise<DeviceSession> {
    const record = await this.db.deviceSession.update({
      where: { id },
      data: {
        lastSeenAt: input.lastSeenAt,
        ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
        ...(input.ipHash !== undefined ? { ipHash: input.ipHash } : {}),
        ...(input.subscriptionId !== undefined
          ? { subscriptionId: input.subscriptionId }
          : {}),
        requestCountWindowStart: input.requestCountWindowStart,
        requestCountInWindow: input.requestCountInWindow,
      },
    });
    return mapDeviceSession(record);
  }

  async revoke(id: string, revokedAt: Date): Promise<DeviceSession> {
    const record = await this.db.deviceSession.update({
      where: { id },
      data: { status: DeviceSessionStatus.REVOKED, revokedAt },
    });
    return mapDeviceSession(record);
  }

  async revokeAllForUser(
    userId: string,
    revokedAt: Date,
    exceptId?: string,
  ): Promise<number> {
    const result = await this.db.deviceSession.updateMany({
      where: {
        userId,
        status: DeviceSessionStatus.ACTIVE,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { status: DeviceSessionStatus.REVOKED, revokedAt },
    });
    return result.count;
  }
}

export const deviceSessionRepository = new PrismaDeviceSessionRepository();
