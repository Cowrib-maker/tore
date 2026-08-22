import type {
  CreateDeviceSessionInput,
  DeviceSession,
  TouchDeviceSessionInput,
} from "@/domain/entities/subscription";

export interface DeviceSessionRepository {
  create(input: CreateDeviceSessionInput): Promise<DeviceSession>;
  findById(id: string): Promise<DeviceSession | null>;
  listByUserId(userId: string): Promise<DeviceSession[]>;
  listActiveByUserId(userId: string): Promise<DeviceSession[]>;
  touch(id: string, input: TouchDeviceSessionInput): Promise<DeviceSession>;
  revoke(id: string, revokedAt: Date): Promise<DeviceSession>;
  revokeAllForUser(
    userId: string,
    revokedAt: Date,
    exceptId?: string,
  ): Promise<number>;
}
