import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminUserPaymentTrace } from "@/application/actions/admin-payment-center.actions";
import { AdminVerifyQpayButton } from "@/components/admin/admin-verify-qpay-button";
import { PaymentCenterTabs } from "@/components/admin/payment-center-tabs";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function formatDate(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 16) : "—";
}

export default async function AdminPaymentTracePage({
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
  const identifier = typeof params.user === "string" ? params.user : "";
  const trace = identifier ? await getAdminUserPaymentTrace(identifier) : null;

  return (
    <>
      <DashboardPageHeading>Хэрэглэгчийн эрхийн трайс</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/payments/trace" />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">
            Хэрэглэгч → Захиалга → Нэхэмжлэл → QPay төлбөр
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Хэрэглэгчийн ID эсвэл имэйл
              <input
                type="text"
                name="user"
                defaultValue={identifier}
                placeholder="user@example.com эсвэл cma..."
                className="h-9 w-72 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Хайх
            </button>
          </form>
        </CardContent>
      </Card>

      {!identifier ? null : !trace ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Энэ ID/имэйлтэй хэрэглэгч олдсонгүй.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {trace.userName || "—"} — {trace.userEmail ?? trace.userId}
              </CardTitle>
            </CardHeader>
          </Card>

          {trace.subscriptions.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Энэ хэрэглэгч ямар ч захиалгагүй байна.
              </CardContent>
            </Card>
          ) : (
            trace.subscriptions.map((subscription) => (
              <Card key={subscription.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">
                      {subscription.planCode} захиалга
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          subscription.status === SubscriptionStatus.ACTIVE ? "default" : "outline"
                        }
                      >
                        {subscription.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(subscription.currentPeriodStart)} →{" "}
                        {formatDate(subscription.currentPeriodEnd)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {subscription.invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Энэ захиалгад холбогдсон нэхэмжлэл алга.
                    </p>
                  ) : (
                    subscription.invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                      >
                        <div>
                          <p>
                            <span className="text-muted-foreground">Нэхэмжлэл: </span>
                            <span className="font-medium">
                              {invoice.amountMnt.toLocaleString("mn-MN")}₮
                            </span>{" "}
                            <Badge variant="outline">{invoice.provider}</Badge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Үүсгэсэн: {formatDate(invoice.createdAt)} · Лавлагаа:{" "}
                            <span className="font-mono">{invoice.providerInvoiceId ?? "—"}</span>
                          </p>
                          {invoice.paymentCode ? (
                            <p className="text-xs text-muted-foreground">
                              Гүйлгээний утга (код):{" "}
                              <span className="font-mono font-semibold">
                                {invoice.paymentCode}
                              </span>
                            </p>
                          ) : null}
                          {invoice.payment ? (
                            <p className="text-xs text-muted-foreground">
                              QPay төлбөрийн ID:{" "}
                              <span className="font-mono">{invoice.payment.providerPaymentId}</span>{" "}
                              · Төлсөн: {formatDate(invoice.payment.paidAt)}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Холбогдсон төлбөрийн гүйлгээ алга.
                            </p>
                          )}
                          {invoice.verifiedByUserId ? (
                            <p className="text-xs text-muted-foreground">
                              Шалгасан админ: {invoice.verifiedByUserId} ·{" "}
                              {formatDate(invoice.verifiedAt)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              invoice.status === InvoiceStatus.PAID ? "default" : "secondary"
                            }
                          >
                            {invoice.status}
                          </Badge>
                          {invoice.provider === BILLING_PROVIDER_QPAY &&
                          (invoice.status === InvoiceStatus.PENDING ||
                            invoice.status === InvoiceStatus.FAILED) ? (
                            <AdminVerifyQpayButton invoiceId={invoice.id} />
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))
          )}

          {trace.unlinkedInvoices.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Захиалгад холбогдоогүй нэхэмжлэл</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {trace.unlinkedInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div>
                      <p>
                        {invoice.amountMnt.toLocaleString("mn-MN")}₮ ·{" "}
                        <Badge variant="outline">{invoice.provider}</Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(invoice.createdAt)} · {invoice.providerInvoiceId ?? "—"}
                        {invoice.paymentCode ? (
                          <>
                            {" "}
                            · Код:{" "}
                            <span className="font-mono font-semibold">
                              {invoice.paymentCode}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{invoice.status}</Badge>
                      {invoice.provider === BILLING_PROVIDER_QPAY &&
                      (invoice.status === InvoiceStatus.PENDING ||
                        invoice.status === InvoiceStatus.FAILED) ? (
                        <AdminVerifyQpayButton invoiceId={invoice.id} />
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
