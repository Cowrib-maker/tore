import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, PauseCircle, XCircle } from "lucide-react";

import { getSessionUser } from "@/application/common/session";
import { getAdminLawyerVerificationQueue } from "@/application/actions/verification.actions";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { AdminLawyerAccountActions } from "@/components/admin/admin-lawyer-account-actions";
import { AdminListingActions } from "@/components/admin/admin-listing-actions";
import {
  AdminVerificationStatusBadge,
  type VerificationBadgeTone,
} from "@/components/admin/admin-verification-status-badge";
import { ReviewCredentialActions } from "@/components/verification/review-credential-actions";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CredentialReviewStatus,
  LawyerVerificationStatus,
  UserRole,
} from "@/domain/enums";
import { isLawyerVerified } from "@/domain/services/lawyer-eligibility";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import {
  formatCredentialStatus,
  formatDateTimeUlaanbaatar,
  formatVerificationStatus,
} from "@/lib/format-labels";
import { localizedTaxonomyName } from "@/lib/localized-content";

const LAWYER_STATUS_TONE: Record<LawyerVerificationStatus, VerificationBadgeTone> = {
  [LawyerVerificationStatus.PENDING]: "warning",
  [LawyerVerificationStatus.APPROVED]: "success",
  [LawyerVerificationStatus.REJECTED]: "destructive",
  [LawyerVerificationStatus.SUSPENDED]: "neutral",
};

const CREDENTIAL_STATUS_TONE: Record<CredentialReviewStatus, VerificationBadgeTone> = {
  [CredentialReviewStatus.SUBMITTED]: "warning",
  [CredentialReviewStatus.APPROVED]: "success",
  [CredentialReviewStatus.REJECTED]: "destructive",
};

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

  // Real counts only — derived from the already-fetched queue/directory,
  // never a separate fabricated statistic.
  const pendingCount = queue.items.length;
  const approvedCount = queue.directory.filter(
    (item) => item.lawyer.verificationStatus === LawyerVerificationStatus.APPROVED,
  ).length;
  const rejectedCount = queue.directory.filter(
    (item) => item.lawyer.verificationStatus === LawyerVerificationStatus.REJECTED,
  ).length;
  const suspendedCount = queue.directory.filter(
    (item) => item.lawyer.verificationStatus === LawyerVerificationStatus.SUSPENDED,
  ).length;

  return (
    <>
      <h1 className="text-2xl font-bold text-ink sm:text-[1.75rem]">
        {a.pageTitle}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{a.pendingHelp}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiTile
          icon={Clock}
          label={formatVerificationStatus(LawyerVerificationStatus.PENDING, locale)}
          value={String(pendingCount)}
        />
        <AdminKpiTile
          icon={CheckCircle2}
          label={formatVerificationStatus(LawyerVerificationStatus.APPROVED, locale)}
          value={String(approvedCount)}
        />
        <AdminKpiTile
          icon={XCircle}
          label={formatVerificationStatus(LawyerVerificationStatus.REJECTED, locale)}
          value={String(rejectedCount)}
        />
        <AdminKpiTile
          icon={PauseCircle}
          label={formatVerificationStatus(LawyerVerificationStatus.SUSPENDED, locale)}
          value={String(suspendedCount)}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">{a.pendingTitle}</h2>

        {queue.items.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={a.emptyQueue}
            action={
              <Link
                href="/admin/dashboard"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {a.backDashboard}
              </Link>
            }
          />
        ) : (
          <div className="mt-4 grid gap-4">
            {queue.items.map((item) => (
              <Card key={item.credential.id}>
                <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">
                        {item.lawyerName ?? m.common.lawyerFallback}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {item.lawyer.slug}
                        </span>
                      </h3>
                      <AdminVerificationStatusBadge
                        tone={CREDENTIAL_STATUS_TONE[item.credential.status]}
                        label={formatCredentialStatus(item.credential.status, locale)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.lawyerEmail} · {a.submitted}{" "}
                      {formatDateTimeUlaanbaatar(item.credential.submittedAt, locale)}
                    </p>
                    <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">{a.license}</dt>
                        <dd className="mt-0.5 font-medium text-ink">
                          {item.credential.licenseNumber}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{a.authority}</dt>
                        <dd className="mt-0.5 font-medium text-ink">
                          {item.credential.issuingAuthority}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{a.experience}</dt>
                        <dd className="mt-0.5 font-medium text-ink">
                          {item.lawyer.yearsOfExperience ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{a.phone}</dt>
                        <dd className="mt-0.5 font-medium text-ink">
                          {item.lawyer.phone ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">{a.practiceAreas}</dt>
                        <dd className="mt-0.5 font-medium text-ink">
                          {item.practiceAreas.length > 0
                            ? item.practiceAreas
                                .map((area) => localizedTaxonomyName(area, locale))
                                .join(", ")
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    {item.lawyer.bio ? (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {item.lawyer.bio}
                      </p>
                    ) : null}
                    <a
                      href={item.documentUrl}
                      className="inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.openDocument.replace(
                        "{file}",
                        item.credential.documentFileName,
                      )}
                    </a>
                  </div>
                  <div className="shrink-0 sm:w-64">
                    <ReviewCredentialActions
                      credentialId={item.credential.id}
                      copy={m.reviewCredential}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">{a.directoryTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{a.directoryHelp}</p>

        <div className="mt-4 grid gap-4">
          {queue.directory.map((item) => (
            <Card key={item.lawyer.id}>
              <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">
                      {item.lawyerName ?? m.common.lawyerFallback}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {item.lawyer.slug}
                      </span>
                    </h3>
                    <AdminVerificationStatusBadge
                      tone={LAWYER_STATUS_TONE[item.lawyer.verificationStatus]}
                      label={formatVerificationStatus(
                        item.lawyer.verificationStatus,
                        locale,
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.lawyerEmail}
                  </p>
                  <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">{a.license}</dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {item.latestCredential?.licenseNumber ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{a.authority}</dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {item.latestCredential?.issuingAuthority ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{a.experience}</dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {item.lawyer.yearsOfExperience ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{a.listing}</dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {item.lawyer.isListed ? m.common.yes : m.common.no}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">{a.practiceAreas}</dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {item.practiceAreas.length > 0
                          ? item.practiceAreas
                              .map((area) => localizedTaxonomyName(area, locale))
                              .join(", ")
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  {item.documentUrl && item.latestCredential ? (
                    <a
                      href={item.documentUrl}
                      className="inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.openDocument.replace(
                        "{file}",
                        item.latestCredential.documentFileName,
                      )}
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:w-64">
                  <AdminListingActions
                    lawyerProfileId={item.lawyer.id}
                    isListed={item.lawyer.isListed}
                    canList={isLawyerVerified(item.lawyer)}
                    copy={a}
                  />
                  <AdminLawyerAccountActions
                    lawyerProfileId={item.lawyer.id}
                    verificationStatus={item.lawyer.verificationStatus}
                    copy={a}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
