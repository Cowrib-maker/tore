import type { AuditLog, CreateAuditLogInput } from "@/domain/entities/audit-log";
import type {
  AuditLogListInput,
  AuditLogListResult,
  AuditLogRepository,
} from "@/domain/repositories/audit-log-repository";
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

  async list(input: AuditLogListInput): Promise<AuditLogListResult> {
    const where = {
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            createdAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
      ...(input.actorSearch
        ? {
            actor: {
              OR: [
                { email: { contains: input.actorSearch, mode: "insensitive" as const } },
                { name: { contains: input.actorSearch, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        include: { actor: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.db.auditLog.count({ where }),
    ]);

    return {
      items: records.map((record) => ({
        ...mapAuditLog(record),
        actorEmail: record.actor?.email ?? null,
        actorName: record.actor?.name ?? null,
      })),
      total,
    };
  }
}

export const auditLogRepository = new PrismaAuditLogRepository();
