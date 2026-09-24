import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminSubscriptions } from "@/application/actions/admin-payment-center.actions";
import { PaymentCenterTabs } from "@/components/admin/payment-center-tabs";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionPlanCode, SubscriptionStatus, UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 25;

function statusBadgeVariant(
  status: SubscriptionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
      return "default";
    case SubscriptionStatus.CANCELED:
    case SubscriptionStatus.EXPIRED:
      return "destructive";
    case SubscriptionStatus.PAST_DUE:
      return "secondary";
    default:
      return "outline";
  }
}

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AdminSubscriptionsPage({
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

  const params = await searchParams;
  const statusParam = typeof params.status === "string" ? params.status : "";
  const planParam = typeof params.plan === "string" ? params.plan : "";
  const userSearch = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const status = (Object.values(SubscriptionStatus) as string[]).includes(statusParam)
    ? (statusParam as SubscriptionStatus)
    : undefined;
  const planCode = (Object.values(SubscriptionPlanCode) as string[]).includes(planParam)
    ? (planParam as SubscriptionPlanCode)
    : undefined;

  const { items, total } = await getAdminSubscriptions({
    status,
    planCode,
    userSearch: userSearch || undefined,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(next: Record<string, string>) {
    const merged = {
      status: statusParam,
      plan: planParam,
      q: userSearch,
      page: String(page),
      ...next,
    };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return qs ? `/admin/payments/subscriptions?${qs}` : "/admin/payments/subscriptions";
  }

  return (
    <>
      <DashboardPageHeading>Захиалга</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/payments/subscriptions" />

      <Card className="mb-4">
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Хэрэглэгч (имэйл/нэр)
              <input
                type="text"
                name="q"
                defaultValue={userSearch}
                className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Төлөв
              <select
                name="status"
                defaultValue={statusParam}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Бүгд</option>
                {Object.values(SubscriptionStatus).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Багц
              <select
                name="plan"
                defaultValue={planParam}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Бүгд</option>
                {Object.values(SubscriptionPlanCode).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Шүүх
            </button>
            <a
              href="/admin/payments/subscriptions"
              className="h-9 rounded-md border border-input px-3 text-sm leading-9 text-muted-foreground hover:bg-muted"
            >
              Цэвэрлэх
            </a>
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Энэ шүүлтүүрт тохирох захиалга алга байна.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Хэрэглэгч</TableHead>
                  <TableHead>Багц</TableHead>
                  <TableHead>Төлөв</TableHead>
                  <TableHead>Эхэлсэн</TableHead>
                  <TableHead>Дуусах</TableHead>
                  <TableHead>Эх нэхэмжлэл</TableHead>
                  <TableHead>Трайс</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="text-sm">
                      <div>{sub.userName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{sub.userEmail}</div>
                    </TableCell>
                    <TableCell className="text-sm">{sub.planCode}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={statusBadgeVariant(sub.status)}>{sub.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDate(sub.currentPeriodStart)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDate(sub.currentPeriodEnd)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {sub.providerInvoiceId ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <a
                        href={`/admin/payments/trace?user=${encodeURIComponent(sub.ownerUserId)}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Харах
                      </a>
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
            Өмнөх
          </a>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <a
            href={buildHref({ page: String(Math.min(totalPages, page + 1)) })}
            className="text-primary underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:text-muted-foreground aria-disabled:no-underline"
            aria-disabled={page >= totalPages}
          >
            Дараах
          </a>
        </div>
      ) : null}
    </>
  );
}
