import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminAuditLog } from "@/application/actions/admin-audit.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditAction, UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { formatAuditAction, formatDateTimeUtc } from "@/lib/format-labels";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KNOWN_ENTITY_TYPES = [
  "User",
  "LawyerProfile",
  "LawyerCredential",
  "ConsultationOffering",
  "PracticeArea",
  "Language",
  "PlatformSetting",
  "HomepageSection",
  "HomepageContent",
  "AvailabilityRule",
  "AvailabilityException",
  "Booking",
  "ClientProfile",
] as const;

function toStartOfDayUtc(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toEndOfDayUtc(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, params] = await Promise.all([getShellI18n("admin"), searchParams]);
  const m = i18n.dict.marketplace;
  const aa = m.adminAudit;

  const actorSearch = typeof params.actor === "string" ? params.actor : "";
  const entityTypeParam = typeof params.entityType === "string" ? params.entityType : "";
  const actionParam = typeof params.action === "string" ? params.action : "";
  const fromParam = typeof params.from === "string" ? params.from : "";
  const toParam = typeof params.to === "string" ? params.to : "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const entityType = (KNOWN_ENTITY_TYPES as readonly string[]).includes(entityTypeParam)
    ? entityTypeParam
    : undefined;
  const action = (Object.values(AuditAction) as string[]).includes(actionParam)
    ? (actionParam as AuditAction)
    : undefined;

  const { items, total } = await getAdminAuditLog({
    actorSearch: actorSearch || undefined,
    entityType,
    action,
    dateFrom: toStartOfDayUtc(fromParam),
    dateTo: toEndOfDayUtc(toParam),
    page,
  });

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(next: Record<string, string>) {
    const merged = {
      actor: actorSearch,
      entityType: entityTypeParam,
      action: actionParam,
      from: fromParam,
      to: toParam,
      page: String(page),
      ...next,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v),
    ).toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  return (
    <>
      <DashboardPageHeading>{aa.pageTitle}</DashboardPageHeading>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{aa.pageTitle}</CardTitle>
          <CardDescription>{aa.pageHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {aa.filterActor}
              <input
                type="text"
                name="actor"
                defaultValue={actorSearch}
                className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {aa.filterEntityType}
              <select
                name="entityType"
                defaultValue={entityTypeParam}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{aa.entityTypeAll}</option>
                {KNOWN_ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {aa.filterAction}
              <select
                name="action"
                defaultValue={actionParam}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{aa.actionAll}</option>
                {Object.values(AuditAction).map((value) => (
                  <option key={value} value={value}>
                    {formatAuditAction(value, i18n.locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {aa.filterFrom}
              <input
                type="date"
                name="from"
                defaultValue={fromParam}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {aa.filterTo}
              <input
                type="date"
                name="to"
                defaultValue={toParam}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              {aa.apply}
            </button>
            <a
              href="/admin/audit"
              className="h-9 rounded-md border border-input px-3 text-sm leading-9 text-muted-foreground hover:bg-muted"
            >
              {aa.clear}
            </a>
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {aa.empty}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{aa.columnTimestamp}</TableHead>
                  <TableHead>{aa.columnActor}</TableHead>
                  <TableHead>{aa.columnAction}</TableHead>
                  <TableHead>{aa.columnEntity}</TableHead>
                  <TableHead>{aa.columnDetails}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTimeUtc(entry.createdAt, i18n.locale)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.actorEmail ?? entry.actorName ?? aa.systemActor}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatAuditAction(entry.action, i18n.locale)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{entry.entityType}</div>
                      {entry.entityId ? (
                        <div className="text-muted-foreground">{entry.entityId}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-xs break-all text-xs text-muted-foreground">
                      {entry.metadata ? JSON.stringify(entry.metadata) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <a
            href={buildHref({ page: String(Math.max(1, page - 1)) })}
            className="text-primary underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:text-muted-foreground aria-disabled:no-underline"
            aria-disabled={page <= 1}
          >
            {aa.prev}
          </a>
          <span className="text-muted-foreground">
            {aa.pageOf
              .replace("{current}", String(page))
              .replace("{total}", String(totalPages))}
          </span>
          <a
            href={buildHref({ page: String(Math.min(totalPages, page + 1)) })}
            className="text-primary underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:text-muted-foreground aria-disabled:no-underline"
            aria-disabled={page >= totalPages}
          >
            {aa.next}
          </a>
        </div>
      ) : null}
    </>
  );
}
