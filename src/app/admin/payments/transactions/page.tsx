import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminPaymentTransactions } from "@/application/actions/admin-payment-center.actions";
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
import { PaymentTransactionStatus, UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 25;

function statusBadgeVariant(
  status: PaymentTransactionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case PaymentTransactionStatus.PAID:
      return "default";
    case PaymentTransactionStatus.FAILED:
    case PaymentTransactionStatus.CANCELLED:
      return "destructive";
    default:
      return "secondary";
  }
}

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AdminPaymentTransactionsPage({
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
  const userSearch = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const status = (Object.values(PaymentTransactionStatus) as string[]).includes(statusParam)
    ? (statusParam as PaymentTransactionStatus)
    : undefined;

  const { items, total } = await getAdminPaymentTransactions({
    status,
    userSearch: userSearch || undefined,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(next: Record<string, string>) {
    const merged = { status: statusParam, q: userSearch, page: String(page), ...next };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return qs ? `/admin/payments/transactions?${qs}` : "/admin/payments/transactions";
  }

  return (
    <>
      <DashboardPageHeading>Гүйлгээ</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/payments/transactions" />

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
                {Object.values(PaymentTransactionStatus).map((value) => (
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
              href="/admin/payments/transactions"
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
            Энэ шүүлтүүрт тохирох гүйлгээ алга байна.
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
                  <TableHead>Дүн</TableHead>
                  <TableHead>Провайдер</TableHead>
                  <TableHead>Төлөв</TableHead>
                  <TableHead>Төлбөрийн ID</TableHead>
                  <TableHead>Төлсөн огноо</TableHead>
                  <TableHead>Нэхэмжлэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">{tx.userEmail ?? "—"}</TableCell>
                    <TableCell className="text-sm">{tx.planCode ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {tx.amountMnt.toLocaleString("mn-MN")}₮
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{tx.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={statusBadgeVariant(tx.status)}>{tx.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{tx.providerPaymentId}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {tx.paidAt ? formatDate(tx.paidAt) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {tx.userId ? (
                        <a
                          href={`/admin/payments/trace?user=${encodeURIComponent(tx.userId)}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Трайс
                        </a>
                      ) : (
                        "—"
                      )}
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
