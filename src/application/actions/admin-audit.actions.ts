"use server";

import { requireActor } from "@/application/common/require-actor";
import { listAdminAuditLogUseCase } from "@/application/use-cases/admin/audit-log";
import type { AuditAction } from "@/domain/enums";
import { UserRole } from "@/domain/enums";
import { auditLogRepository } from "@/infrastructure/repositories";

export async function getAdminAuditLog(input: {
  actorSearch?: string;
  entityType?: string;
  action?: AuditAction;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
}) {
  const actor = await requireActor(UserRole.ADMIN);
  return listAdminAuditLogUseCase(actor, input, { auditLogRepository });
}
