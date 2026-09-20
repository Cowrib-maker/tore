import type { AuditLog, CreateAuditLogInput } from "@/domain/entities/audit-log";
import type { AuditAction } from "@/domain/enums";

/** Audit log entry enriched with the actor's identity for display — never a second query per row. */
export type AuditLogListItem = AuditLog & {
  actorEmail: string | null;
  actorName: string | null;
};

export type AuditLogListFilters = {
  /** Matches actor email or name (case-insensitive substring). */
  actorSearch?: string;
  entityType?: string;
  action?: AuditAction;
  /** Inclusive lower bound on createdAt. */
  dateFrom?: Date;
  /** Inclusive upper bound on createdAt. */
  dateTo?: Date;
};

export type AuditLogListInput = AuditLogListFilters & {
  limit: number;
  offset: number;
};

export type AuditLogListResult = {
  items: AuditLogListItem[];
  total: number;
};

export interface AuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLog>;
  list(input: AuditLogListInput): Promise<AuditLogListResult>;
}
