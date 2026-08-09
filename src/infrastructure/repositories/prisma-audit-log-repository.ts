import type { AuditLog, CreateAuditLogInput } from "@/domain/entities/audit-log";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import { mapAuditLog } from "@/infrastructure/mappers/audit-log.mapper";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const record = await this.db.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as object | undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
    return mapAuditLog(record);
  }
}

export const auditLogRepository = new PrismaAuditLogRepository();
