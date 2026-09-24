import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminQpayDiagnostics } from "@/application/actions/admin-payment-center.actions";
import { PaymentCenterTabs } from "@/components/admin/payment-center-tabs";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

function formatDate(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 16) : "—";
}

export default async function AdminQpayDiagnosticsPage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const diagnostics = await getAdminQpayDiagnostics();

  return (
    <>
      <DashboardPageHeading>QPay diagnostics</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/payments/diagnostics" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Тохиргоо</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Орчин: </span>
              <Badge variant={diagnostics.environment === "PRODUCTION" ? "default" : "secondary"}>
                {diagnostics.environment}
              </Badge>
            </p>
            <p>
              <span className="text-muted-foreground">QPay интеграц тохируулагдсан эсэх: </span>
              <Badge variant={diagnostics.configured ? "default" : "destructive"}>
                {diagnostics.configured ? "Тийм" : "Үгүй"}
              </Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              Client ID, client secret, access/refresh token зэрэг нууц утгууд энэ дэлгэц дээр
              хэзээ ч харагдахгүй.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Сүүлийн үйл ажиллагаа</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Сүүлд үүсгэсэн QPay нэхэмжлэл: </span>
              {formatDate(diagnostics.lastInvoiceCreatedAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Сүүлд баталгаажсан QPay төлбөр: </span>
              {formatDate(diagnostics.lastPaymentPaidAt)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">QPay нэхэмжлэлийн тоо (провайдероор)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Баталгаажсан: </span>
              {diagnostics.paidInvoiceCount}
            </p>
            <p>
              <span className="text-muted-foreground">Амжилтгүй: </span>
              {diagnostics.failedInvoiceCount}
            </p>
            <p>
              <span className="text-muted-foreground">Хүлээгдэж буй (төлөгдөөгүй): </span>
              {diagnostics.pendingInvoiceCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Callback лог</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Callback хүсэлт бүрийг тусад нь бүртгэдэг лог одоогоор энэ системд
            хэрэгжээгүй тул сүүлийн callback-ийн цаг, амжилт/алдааны тоо энд
            харагдахгүй байна (дээрх нэхэмжлэлийн тоо нь харин бодит DB өгөгдөл
            дээр суурилсан ойролцоо орлуулагч үзүүлэлт). <strong>Тун удахгүй.</strong>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
