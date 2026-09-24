import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminInvoices } from "@/application/actions/admin-payment-center.actions";
import { AdminRejectPaymentButton } from "@/components/admin/admin-reject-payment-button";
import { AdminVerifyPaymentButton } from "@/components/admin/admin-verify-payment-button";
import { AdminVerifyQpayButton } from "@/components/admin/admin-verify-qpay-button";
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
import {
  BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
  BILLING_PROVIDER_MANUAL_QR,
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  SubscriptionPlanCode,
  UserRole,
} from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 25;

function methodLabel(provider: string): string {
  if (provider === BILLING_PROVIDER_QPAY) return "QPay";
  if (provider === BILLING_PROVIDER_MANUAL_BANK_TRANSFER) return "Дансаар шилжүүлэх";
  if (provider === BILLING_PROVIDER_MANUAL_QR) return "QR кодоор";
  return provider;
}

function statusBadgeVariant(
  status: InvoiceStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case InvoiceStatus.PAID:
      return "default";
    case InvoiceStatus.FAILED:
    case InvoiceStatus.CANCELLED:
      return "destructive";
    case InvoiceStatus.AWAITING_VERIFICATION:
    case InvoiceStatus.PENDING:
      return "secondary";
    default:
      return "outline";
  }
}

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AdminPaymentInvoicesPage({
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
  const providerParam = typeof params.provider === "string" ? params.provider : "";
  const userSearch = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const status = (Object.values(InvoiceStatus) as string[]).includes(statusParam)
    ? (statusParam as InvoiceStatus)
    : undefined;
  const planCode = (Object.values(SubscriptionPlanCode) as string[]).includes(planParam)
    ? (planParam as SubscriptionPlanCode)
    : undefined;
  const provider = providerParam || undefined;

  const { items, total } = await getAdminInvoices({
    status,
    planCode,
    provider,
    userSearch: userSearch || undefined,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(next: Record<string, string>) {
    const merged = {
      status: statusParam,
      plan: planParam,
      provider: providerParam,
      q: userSearch,
      page: String(page),
      ...next,
    };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return qs ? `/admin/payments/invoices?${qs}` : "/admin/payments/invoices";
  }

  return (
    <>
      <DashboardPageHeading>Нэхэмжлэл</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/payments/invoices" />

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
                {Object.values(InvoiceStatus).map((value) => (
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
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Провайдер
              <select
                name="provider"
                defaultValue={providerParam}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Бүгд</option>
                <option value={BILLING_PROVIDER_QPAY}>QPay</option>
                <option value={BILLING_PROVIDER_MANUAL_BANK_TRANSFER}>Дансаар</option>
                <option value={BILLING_PROVIDER_MANUAL_QR}>QR</option>
              </select>
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Шүүх
            </button>
            <a
              href="/admin/payments/invoices"
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
            Энэ шүүлтүүрт тохирох нэхэмжлэл алга байна.
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
                  <TableHead>Арга</TableHead>
                  <TableHead>Төлөв</TableHead>
                  <TableHead>Үүсгэсэн</TableHead>
                  <TableHead>QPay/лавлагаа дугаар</TableHead>
                  <TableHead>Төлбөрийн ID</TableHead>
                  <TableHead>Үйлдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="text-sm">
                      <div>{invoice.userName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{invoice.userEmail}</div>
                    </TableCell>
                    <TableCell className="text-sm">{invoice.planCode ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {invoice.amountMnt.toLocaleString("mn-MN")}₮
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{methodLabel(invoice.provider)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={statusBadgeVariant(invoice.status)}>{invoice.status}</Badge>
                      {invoice.rejectionReason ? (
                        <div className="mt-1 max-w-[16rem] text-destructive">
                          {invoice.rejectionReason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDate(invoice.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {invoice.providerInvoiceId ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {invoice.paymentProviderPaymentId ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {invoice.status === InvoiceStatus.AWAITING_VERIFICATION ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AdminVerifyPaymentButton invoiceId={invoice.id} />
                          <AdminRejectPaymentButton invoiceId={invoice.id} />
                        </div>
                      ) : invoice.provider === BILLING_PROVIDER_QPAY &&
                        (invoice.status === InvoiceStatus.PENDING ||
                          invoice.status === InvoiceStatus.FAILED) ? (
                        <AdminVerifyQpayButton invoiceId={invoice.id} />
                      ) : (
                        <a
                          href={`/admin/payments/trace?user=${encodeURIComponent(invoice.userId)}`}
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          Трайс харах
                        </a>
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
