import type { AuditLog } from "@/domain/entities/audit-log";
import type { AuditAction } from "@/domain/enums";

type AuditLogRecord = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export function mapAuditLog(record: AuditLogRecord): AuditLog {
  return {
    id: record.id,
    actorUserId: record.actorUserId,
    action: record.action as AuditAction,
    entityType: record.entityType,
    entityId: record.entityId,
    metadata: record.metadata as Record<string, unknown> | null,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    createdAt: record.createdAt,
  };
}
