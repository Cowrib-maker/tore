import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminPaymentDashboard } from "@/application/actions/admin-payment-center.actions";
import { PaymentCenterTabs } from "@/components/admin/payment-center-tabs";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

function formatMnt(amount: number): string {
  return `${amount.toLocaleString("mn-MN")}₮`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function AdminPaymentsOverviewPage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const totals = await getAdminPaymentDashboard();

  return (
    <>
      <DashboardPageHeading>Төлбөрийн тойм</DashboardPageHeading>
      <PaymentCenterTabs active="/admin/payments" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Нийт орлого" value={formatMnt(totals.totalRevenueMnt)} hint="Баталгаажсан гүйлгээ" />
        <Kpi label="Өнөөдрийн орлого" value={formatMnt(totals.todayRevenueMnt)} />
        <Kpi label="Энэ сарын орлого" value={formatMnt(totals.monthRevenueMnt)} />
        <Kpi label="Баталгаажсан нэхэмжлэл" value={String(totals.paidInvoiceCount)} />
        <Kpi
          label="Хүлээгдэж буй нэхэмжлэл"
          value={String(totals.pendingInvoiceCount)}
          hint="QPay төлөгдөөгүй + гар аргаар шалгагдаж буй"
        />
        <Kpi label="Амжилтгүй нэхэмжлэл" value={String(totals.failedInvoiceCount)} />
        <Kpi label="Хугацаа дууссан нэхэмжлэл" value={String(totals.expiredInvoiceCount)} />
        <Kpi label="Цуцлагдсан нэхэмжлэл" value={String(totals.cancelledInvoiceCount)} />
        <Kpi label="Нийт гүйлгээ" value={String(totals.totalTransactionCount)} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Буцаалт / цуцлалт</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          QPay буцаалт (refund) API интеграц одоогоор энэ систем дээр хэрэгжээгүй тул
          буцаалтын тоо болон захиалгын цуцлах товч харагдахгүй байна. Энэ нь
          дэлгэц дээр буцаагдсан мэт хуурамч тоо харуулахаас илүү аюулгүй гэж
          үзсэн — backend хэрэгжсэний дараа энд нэмэгдэнэ.
        </CardContent>
      </Card>
    </>
  );
}
