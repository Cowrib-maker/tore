import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerVerificationForSession } from "@/application/actions/verification.actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { SubmitCredentialForm } from "@/components/verification/submit-credential-form";
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
import { getFileStorage } from "@/infrastructure/storage";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import {
  formatCredentialStatus,
  formatDateTimeUtc,
  formatVerificationStatus,
} from "@/lib/format-labels";

function verificationBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "REJECTED":
    case "SUSPENDED":
      return "destructive";
    default:
      return "secondary";
  }
}

export default async function LawyerVerificationPage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const i18n = await getShellI18n("lawyer");
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const nav = i18n.nav;
  const pageTitle = i18n.pages.verification;
  const v = m.verification;

  const data = await getLawyerVerificationForSession();
  if (data.status === "unauthenticated") redirect("/login");
  if (data.status === "forbidden") {
    redirect(getDashboardPath(UserRole.LAWYER));
  }
  if (data.status === "profile_missing") {
    return (
      <DashboardShell
        user={session.user}
        title={pageTitle}
        nav={nav}
        {...i18n.shellProps}
      >
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
          copy={m.profileMissing}
        />
      </DashboardShell>
    );
  }

  const storage = getFileStorage();
  const credentialsWithUrls = await Promise.all(
    data.data.credentials.map(async (credential) => ({
      credential,
      documentUrl: await storage.getUrl(credential.documentUrl),
    })),
  );

  const status = data.data.profile.verificationStatus;

  return (
    <DashboardShell
      user={session.user}
      title={pageTitle}
      nav={nav}
      {...i18n.shellProps}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{v.statusTitle}</CardTitle>
              <Badge variant={verificationBadgeVariant(status)}>
                {formatVerificationStatus(status, locale)}
              </Badge>
            </div>
            <CardDescription>{v.statusHelp}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              {v.approvedOn}{" "}
              {data.data.profile.verifiedAt
                ? `${formatDateTimeUtc(data.data.profile.verifiedAt, locale)} ${m.common.utc}`
                : "—"}
            </p>
            <p>
              {v.listingLabel}{" "}
              {data.data.profile.isListed ? m.common.yes : m.common.no} ·{" "}
              <Link
                href="/lawyer/profile"
                className="text-primary underline-offset-4 hover:underline"
              >
                {v.profileSettings}
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{v.submitTitle}</CardTitle>
            <CardDescription>{v.submitHelp}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.data.canSubmit ? (
              <SubmitCredentialForm copy={m.submitCredential} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {status === "APPROVED"
                  ? v.approvedMsg
                  : status === "SUSPENDED"
                    ? v.suspendedMsg
                    : v.awaitingMsg}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{v.historyTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {credentialsWithUrls.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">{v.emptyTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{v.emptyBody}</p>
            </div>
          ) : (
            credentialsWithUrls.map(({ credential, documentUrl }) => (
              <div
                key={credential.id}
                className="flex flex-col gap-1 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {credential.licenseNumber} · {credential.issuingAuthority}
                  </p>
                  <p className="text-muted-foreground">
                    {formatCredentialStatus(credential.status, locale)}
                    {credential.rejectionReason
                      ? ` — ${credential.rejectionReason}`
                      : ""}
                  </p>
                </div>
                <a
                  href={documentUrl}
                  className="text-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {credential.documentFileName}
                </a>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
