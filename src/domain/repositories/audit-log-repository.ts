import type { AuditLog, CreateAuditLogInput } from "@/domain/entities/audit-log";

export interface AuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLog>;
}
