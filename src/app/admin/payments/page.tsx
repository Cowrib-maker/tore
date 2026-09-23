import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminManualPaymentsList } from "@/application/actions/admin-payments.actions";
import { AdminVerifyPaymentButton } from "@/components/admin/admin-verify-payment-button";
import { AdminRejectPaymentButton } from "@/components/admin/admin-reject-payment-button";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
  BILLING_PROVIDER_MANUAL_QR,
  InvoiceStatus,
  UserRole,
} from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { status: InvoiceStatus.AWAITING_VERIFICATION, label: "Хүлээгдэж буй" },
  { status: InvoiceStatus.PAID, label: "Баталгаажсан" },
  { status: InvoiceStatus.FAILED, label: "Татгалзсан" },
] as const;

function methodLabel(provider: string): string {
  if (provider === BILLING_PROVIDER_MANUAL_BANK_TRANSFER) return "Дансаар шилжүүлэх";
  if (provider === BILLING_PROVIDER_MANUAL_QR) return "QR кодоор";
  return provider;
}

function statusBadgeVariant(status: InvoiceStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case InvoiceStatus.PAID:
      return "default";
    case InvoiceStatus.FAILED:
      return "destructive";
    case InvoiceStatus.AWAITING_VERIFICATION:
      return "secondary";
    default:
      return "outline";
  }
}

export default async function AdminPaymentsPage({
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
  const tabParam = typeof params.status === "string" ? params.status : "";
  const activeStatus =
    TABS.find((tab) => tab.status === tabParam)?.status ?? InvoiceStatus.AWAITING_VERIFICATION;

  const items = await getAdminManualPaymentsList(activeStatus);

  return (
    <>
      <DashboardPageHeading>Гар аргаар баталгаажуулах төлбөр</DashboardPageHeading>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <a
            key={tab.status}
            href={`/admin/payments?status=${tab.status}`}
            className={
              tab.status === activeStatus
                ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            }
          >
            {tab.label}
          </a>
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Энэ ангилалд төлбөр алга байна.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {invoice.userName || invoice.userEmail || invoice.userId}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{invoice.userEmail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{methodLabel(invoice.provider)}</Badge>
                    <Badge variant={statusBadgeVariant(invoice.status)}>{invoice.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Дүн: </span>
                    <span className="font-medium">{invoice.amountMnt.toLocaleString("mn-MN")}₮</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Гүйлгээний утга: </span>
                    <span className="font-mono font-medium">{invoice.providerInvoiceId}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Багц: </span>
                    <span className="font-medium">{invoice.planCode ?? "—"}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Үүсгэсэн: </span>
                    <span className="font-medium">
                      {invoice.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                    </span>
                  </p>
                  {invoice.verifiedByUserId ? (
                    <p className="sm:col-span-2">
                      <span className="text-muted-foreground">Шалгасан: </span>
                      <span className="font-medium">{invoice.verifiedByUserId}</span>{" "}
                      {invoice.verifiedAt
                        ? invoice.verifiedAt.toISOString().replace("T", " ").slice(0, 16)
                        : null}
                    </p>
                  ) : null}
                  {invoice.rejectionReason ? (
                    <p className="text-destructive sm:col-span-2">
                      <span className="text-muted-foreground">Татгалзсан шалтгаан: </span>
                      {invoice.rejectionReason}
                    </p>
                  ) : null}
                </div>
                {invoice.status === InvoiceStatus.AWAITING_VERIFICATION ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <AdminVerifyPaymentButton invoiceId={invoice.id} />
                    <AdminRejectPaymentButton invoiceId={invoice.id} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
