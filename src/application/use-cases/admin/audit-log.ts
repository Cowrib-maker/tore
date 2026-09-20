import type { ActorContext } from "@/application/common/actor-context";
import { sanitizeAuditMetadata } from "@/application/common/sanitize-audit-metadata";
import type { AuditAction } from "@/domain/enums";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type {
  AuditLogListItem,
  AuditLogRepository,
} from "@/domain/repositories/audit-log-repository";

export const ADMIN_AUDIT_LOG_PAGE_SIZE = 25;

export type ListAdminAuditLogInput = {
  actorSearch?: string;
  entityType?: string;
  action?: AuditAction;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
};

export type ListAdminAuditLogResult = {
  items: AuditLogListItem[];
  total: number;
};

function assertAdmin(actor: Pick<ActorContext, "role">) {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
}

export async function listAdminAuditLogUseCase(
  actor: ActorContext,
  input: ListAdminAuditLogInput,
  deps: { auditLogRepository: AuditLogRepository },
): Promise<ListAdminAuditLogResult> {
  assertAdmin(actor);

  const limit = ADMIN_AUDIT_LOG_PAGE_SIZE;
  const offset = (Math.max(1, input.page) - 1) * limit;

  const { items, total } = await deps.auditLogRepository.list({
    actorSearch: input.actorSearch,
    entityType: input.entityType,
    action: input.action,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit,
    offset,
  });

  return {
    items: items.map((item) => ({
      ...item,
      metadata: sanitizeAuditMetadata(item.metadata),
    })),
    total,
  };
}
