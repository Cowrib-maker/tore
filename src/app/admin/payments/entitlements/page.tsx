import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminEntitlements } from "@/application/actions/admin-payment-center.actions";
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
import { SubscriptionStatus, UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 25;

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function isActive(status: SubscriptionStatus | null, periodEnd: Date | null): boolean {
  return status === SubscriptionStatus.ACTIVE && !!periodEnd && periodEnd.getTime() > Date.now();
}

export default async function AdminEntitlementsPage({
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
  const userSearch = typeof params.q === "string" ? params.q : "";
  const activeOnly = params.active === "1";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const { items, total } = await getAdminEntitlements({
    userSearch: userSearch || undefined,
    activeOnly,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(next: Record<string, string>) {
    const merged = {
      q: userSearch,
      active: activeOnly ? "1" : "",
      page: String(page),
      ...next,
    };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return qs ? `/admin/payments/entitlements?${qs}` : "/admin/payments/entitlements";
  }

  return (
    <>
      <DashboardPageHeading>Эрхийн багц (Entitlement)</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/payments/entitlements" />

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
            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input type="checkbox" name="active" value="1" defaultChecked={activeOnly} />
              Зөвхөн идэвхтэй
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Шүүх
            </button>
            <a
              href="/admin/payments/entitlements"
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
            Энэ шүүлтүүрт тохирох эрхийн багц алга байна.
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
                  <TableHead>Дуусах</TableHead>
                  <TableHead>Тайлбар/шинжилгээ</TableHead>
                  <TableHead>Баримт бичиг</TableHead>
                  <TableHead>Хууль зүйн AI</TableHead>
                  <TableHead>Трайс</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.userId}-${item.periodStart.toISOString()}`}>
                    <TableCell className="text-sm">
                      <div>{item.userName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{item.userEmail}</div>
                    </TableCell>
                    <TableCell className="text-sm">{item.planCode ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {item.subscriptionStatus ? (
                        <Badge
                          variant={
                            isActive(item.subscriptionStatus, item.currentPeriodEnd)
                              ? "default"
                              : "outline"
                          }
                        >
                          {isActive(item.subscriptionStatus, item.currentPeriodEnd)
                            ? "Идэвхтэй"
                            : "Дууссан"}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {item.currentPeriodEnd ? formatDate(item.currentPeriodEnd) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{item.caseAnalysisCount}</TableCell>
                    <TableCell className="text-sm">{item.documentAnalysisCount}</TableCell>
                    <TableCell className="text-sm">{item.legalAiQueryCount}</TableCell>
                    <TableCell className="text-xs">
                      <a
                        href={`/admin/payments/trace?user=${encodeURIComponent(item.userId)}`}
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
