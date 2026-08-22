import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { getLawyerVerificationForSession } from "@/application/actions/verification.actions";
import { LawyerTaxonomyForm } from "@/components/marketplace/lawyer-taxonomy-form";
import {
  AvailabilityExceptionList,
  AvailabilityRuleList,
  CreateAvailabilityExceptionForm,
  CreateAvailabilityRuleForm,
} from "@/components/marketplace/availability-forms";
import { ChangeEmailForm } from "@/components/profiles/change-email-form";
import { ChangePasswordForm } from "@/components/profiles/change-password-form";
import { BillingAndSessionsPanel } from "@/components/account/billing-and-sessions-panel";
import { LawyerProfileForm } from "@/components/profiles/lawyer-profile-form";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { LawyerVerificationSection } from "@/components/verification/lawyer-verification-section";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { buildAppFilePath } from "@/infrastructure/storage/file-access";
import {
  availabilityRepository,
  languageRepository,
  lawyerTaxonomyRepository,
  practiceAreaRepository,
} from "@/infrastructure/repositories";
import { formatVerificationStatus } from "@/lib/format-labels";
import { splitDisplayName } from "@/lib/person-name";

export default async function LawyerProfilePage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [data, verification, i18n] = await Promise.all([
    getLawyerProfileForSession(),
    getLawyerVerificationForSession(),
    getShellI18n("lawyer"),
  ]);
  if (data.status === "unauthenticated") {
    redirect("/login");
  }

  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const lp = m.lawyerProfile;

  if (data.status === "profile_missing") {
    return (
      <>
        <DashboardPageHeading>{lp.title}</DashboardPageHeading>
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
          copy={m.profileMissing}
        />
      </>
    );
  }

  const rangeStart = new Date();
  const today = rangeStart.toISOString().slice(0, 10);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 60);
  const horizon = rangeEnd.toISOString().slice(0, 10);

  const [
    practiceAreas,
    languages,
    selectedPractice,
    selectedLanguages,
    availabilityRules,
    availabilityExceptions,
  ] = await Promise.all([
    practiceAreaRepository.findAllActive(),
    languageRepository.findAllActive(),
    lawyerTaxonomyRepository.getPracticeAreas(data.profile.id),
    lawyerTaxonomyRepository.getLanguages(data.profile.id),
    availabilityRepository.findRulesByLawyerProfileId(data.profile.id),
    availabilityRepository.findExceptionsByLawyerProfileId(
      data.profile.id,
      today,
      horizon,
    ),
  ]);

  const formCopy = {
    ...m.lawyerProfileForm,
    saving: m.common.saving,
  };
  const taxonomyCopy = {
    ...m.taxonomyForm,
    saving: m.common.saving,
  };
  const availabilityCopy = {
    ...m.availabilityForm,
    saving: m.common.saving,
  };
  const names = splitDisplayName(data.user.name);
  const credentials =
    verification.status === "ok"
      ? await Promise.all(
          verification.data.credentials.map(async (credential) => ({
            ...credential,
            documentUrl: buildAppFilePath(credential.documentUrl),
          })),
        )
      : [];

  return (
    <>
      <DashboardPageHeading>{lp.title}</DashboardPageHeading>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {lp.publicProfile}{" "}
          <span className="font-medium text-foreground">
            /lawyers/{data.profile.slug}
          </span>
        </span>
        <Badge variant="outline">
          {formatVerificationStatus(data.profile.verificationStatus, locale)}
        </Badge>
        {data.profile.isListed ? (
          <Link
            href={`/lawyers/${data.profile.slug}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {lp.viewPublic}
          </Link>
        ) : null}
      </div>
      <WorkspaceTabs
        defaultValue="profile"
        items={[
          {
            value: "profile",
            label: m.account.tabProfile,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>{lp.title}</CardTitle>
                  <CardDescription>
                    {lp.description}{" "}
                    <Link
                      href="/lawyer/dashboard"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {m.common.returnOverview}
                    </Link>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LawyerProfileForm
                    key={data.profile.updatedAt.toISOString()}
                    lastName={names.lastName}
                    firstName={names.firstName}
                    phone={data.profile.phone ?? ""}
                    headline={data.profile.headline ?? ""}
                    bio={data.profile.bio ?? ""}
                    yearsOfExperience={data.profile.yearsOfExperience}
                    city={data.profile.city ?? ""}
                    education={data.profile.education ?? ""}
                    timezone={data.profile.timezone ?? "Asia/Ulaanbaatar"}
                    copy={formCopy}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "practice",
            label: m.account.tabPractice,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>{lp.taxonomyTitle}</CardTitle>
                  <CardDescription>{lp.taxonomyDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  <LawyerTaxonomyForm
                    practiceAreas={practiceAreas}
                    languages={languages}
                    selectedPracticeAreaIds={selectedPractice.map(
                      (p) => p.practiceAreaId,
                    )}
                    selectedLanguageIds={selectedLanguages.map(
                      (l) => l.languageId,
                    )}
                    copy={taxonomyCopy}
                    locale={locale}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "verification",
            label: m.account.tabVerification,
            content:
              verification.status === "ok" ? (
                <LawyerVerificationSection
                  profile={verification.data.profile}
                  credentials={credentials}
                  canSubmit={verification.data.canSubmit}
                  copy={{
                    ...m.verification,
                    yes: m.common.yes,
                    no: m.common.no,
                  }}
                  submitCopy={m.submitCredential}
                  locale={locale}
                />
              ) : null,
          },
          {
            value: "schedule",
            label: m.account.tabSchedule,
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{m.availability.weeklyTitle}</CardTitle>
                    <CardDescription>
                      {m.availability.weeklyHelp}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <AvailabilityRuleList
                      rules={availabilityRules}
                      copy={availabilityCopy}
                      locale={locale}
                    />
                    <CreateAvailabilityRuleForm
                      copy={availabilityCopy}
                      locale={locale}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{m.availability.exceptionsTitle}</CardTitle>
                    <CardDescription>
                      {m.availability.exceptionsHelp}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <AvailabilityExceptionList
                      exceptions={availabilityExceptions}
                      copy={availabilityCopy}
                    />
                    <CreateAvailabilityExceptionForm copy={availabilityCopy} />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "security",
            label: m.account.tabSecurity,
            content: (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{m.account.emailTitle}</CardTitle>
                    <CardDescription>
                      {m.account.emailDescription}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChangeEmailForm
                      currentEmail={data.user.email}
                      copy={{ ...m.account, saving: m.common.saving }}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{m.account.passwordTitle}</CardTitle>
                    <CardDescription>
                      {m.account.passwordDescription}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChangePasswordForm
                      copy={{ ...m.account, saving: m.common.saving }}
                    />
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "billing",
            label: m.account.tabBilling,
            content: (
              <BillingAndSessionsPanel
                copy={m.account}
                locale={locale}
                supportEmail="support@tore.mn"
              />
            ),
          },
        ]}
      />
    </>
  );
}
