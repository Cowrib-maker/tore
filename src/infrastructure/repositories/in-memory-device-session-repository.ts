import { randomUUID } from "node:crypto";

import type {
  CreateDeviceSessionInput,
  DeviceSession,
  TouchDeviceSessionInput,
} from "@/domain/entities/subscription";
import { DeviceSessionStatus } from "@/domain/enums";
import type { DeviceSessionRepository } from "@/domain/repositories/device-session-repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryDeviceSessionRepository implements DeviceSessionRepository {
  private readonly rows = new Map<string, DeviceSession>();

  clear(): void {
    this.rows.clear();
  }

  seed(session: DeviceSession): void {
    this.rows.set(session.id, clone(session));
  }

  async create(input: CreateDeviceSessionInput): Promise<DeviceSession> {
    const record: DeviceSession = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      userAgent: input.userAgent ?? null,
      ipHash: input.ipHash ?? null,
      firstSeenAt: input.firstSeenAt,
      lastSeenAt: input.lastSeenAt,
      revokedAt: null,
      status: DeviceSessionStatus.ACTIVE,
      requestCountWindowStart: input.requestCountWindowStart ?? input.lastSeenAt,
      requestCountInWindow: input.requestCountInWindow ?? 1,
    };
    this.rows.set(record.id, record);
    return clone(record);
  }

  async findById(id: string): Promise<DeviceSession | null> {
    const record = this.rows.get(id);
    return record ? clone(record) : null;
  }

  async listByUserId(userId: string): Promise<DeviceSession[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((row) => clone(row));
  }

  async listActiveByUserId(userId: string): Promise<DeviceSession[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId && row.status === DeviceSessionStatus.ACTIVE,
      )
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((row) => clone(row));
  }

  async touch(id: string, input: TouchDeviceSessionInput): Promise<DeviceSession> {
    const current = this.rows.get(id);
    if (!current) throw new Error("Device session not found");
    const next: DeviceSession = {
      ...current,
      lastSeenAt: input.lastSeenAt,
      userAgent:
        input.userAgent !== undefined ? input.userAgent : current.userAgent,
      ipHash: input.ipHash !== undefined ? input.ipHash : current.ipHash,
      subscriptionId:
        input.subscriptionId !== undefined
          ? input.subscriptionId
          : current.subscriptionId,
      requestCountWindowStart: input.requestCountWindowStart,
      requestCountInWindow: input.requestCountInWindow,
    };
    this.rows.set(id, next);
    return clone(next);
  }

  async revoke(id: string, revokedAt: Date): Promise<DeviceSession> {
    const current = this.rows.get(id);
    if (!current) throw new Error("Device session not found");
    const next: DeviceSession = {
      ...current,
      status: DeviceSessionStatus.REVOKED,
      revokedAt,
    };
    this.rows.set(id, next);
    return clone(next);
  }

  async revokeAllForUser(
    userId: string,
    revokedAt: Date,
    exceptId?: string,
  ): Promise<number> {
    let count = 0;
    for (const row of this.rows.values()) {
      if (row.userId !== userId) continue;
      if (row.status !== DeviceSessionStatus.ACTIVE) continue;
      if (exceptId && row.id === exceptId) continue;
      this.rows.set(row.id, {
        ...row,
        status: DeviceSessionStatus.REVOKED,
        revokedAt,
      });
      count += 1;
    }
    return count;
  }
}
