import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminLawyerVerificationQueue } from "@/application/actions/verification.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { ReviewCredentialActions } from "@/components/verification/review-credential-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { formatCredentialStatus } from "@/lib/format-labels";

export default async function AdminLawyersPage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, queue] = await Promise.all([
    getShellI18n("admin"),
    getAdminLawyerVerificationQueue(),
  ]);
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const a = m.admin;

  if (queue.status === "unauthenticated") redirect("/login");
  if (queue.status === "forbidden") {
    redirect(getDashboardPath(UserRole.ADMIN));
  }

  return (
    <>
      <DashboardPageHeading>{a.pageTitle}</DashboardPageHeading>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{a.pendingTitle}</CardTitle>
          <CardDescription>{a.pendingHelp}</CardDescription>
        </CardHeader>
      </Card>

      {queue.items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {a.emptyQueue}{" "}
            <Link
              href="/admin/dashboard"
              className="text-primary underline-offset-4 hover:underline"
            >
              {a.backDashboard}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {queue.items.map((item) => (
            <Card key={item.credential.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {item.lawyerName ?? m.common.lawyerFallback} ·{" "}
                      {item.lawyer.slug}
                    </CardTitle>
                    <CardDescription>
                      {item.lawyerEmail} · {a.submitted}{" "}
                      {item.credential.submittedAt.toISOString()}
                    </CardDescription>
                  </div>
                  <Badge>
                    {formatCredentialStatus(item.credential.status, locale)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">{a.license}</span>{" "}
                    {item.credential.licenseNumber}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{a.authority}</span>{" "}
                    {item.credential.issuingAuthority}
                  </p>
                  <p>
                    <a
                      href={item.documentUrl}
                      className="text-primary underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.openDocument.replace(
                        "{file}",
                        item.credential.documentFileName,
                      )}
                    </a>
                  </p>
                </div>
                <ReviewCredentialActions
                  credentialId={item.credential.id}
                  copy={m.reviewCredential}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
