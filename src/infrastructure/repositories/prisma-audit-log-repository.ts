import type { AuditLog, CreateAuditLogInput } from "@/domain/entities/audit-log";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import { mapAuditLog } from "@/infrastructure/mappers/audit-log.mapper";
import { prisma } from "@/infrastructure/database/prisma";

export class PrismaAuditLogRepository implements AuditLogRepository {
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const record = await prisma.auditLog.create({
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
