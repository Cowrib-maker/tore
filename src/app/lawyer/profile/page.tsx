import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { LawyerTaxonomyForm } from "@/components/marketplace/lawyer-taxonomy-form";
import { LawyerProfileForm } from "@/components/profiles/lawyer-profile-form";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { isLawyerVerified } from "@/domain/services/lawyer-eligibility";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import {
  languageRepository,
  lawyerTaxonomyRepository,
  practiceAreaRepository,
} from "@/infrastructure/repositories";
import { formatVerificationStatus } from "@/lib/format-labels";

export default async function LawyerProfilePage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getLawyerProfileForSession();
  if (data.status === "unauthenticated") {
    redirect("/login");
  }

  const i18n = await getShellI18n("lawyer");
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const nav = i18n.nav;
  const lp = m.lawyerProfile;

  if (data.status === "profile_missing") {
    return (
      <DashboardShell
        user={session.user}
        title={lp.title}
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

  const verified = isLawyerVerified(data.profile);
  const canRequestListing = verified && data.hasActiveOffering;

  const [practiceAreas, languages, selectedPractice, selectedLanguages] =
    await Promise.all([
      practiceAreaRepository.findAllActive(),
      languageRepository.findAllActive(),
      lawyerTaxonomyRepository.getPracticeAreas(data.profile.id),
      lawyerTaxonomyRepository.getLanguages(data.profile.id),
    ]);

  const formCopy = {
    ...m.lawyerProfileForm,
    saving: m.common.saving,
  };
  const taxonomyCopy = {
    ...m.taxonomyForm,
    saving: m.common.saving,
  };

  return (
    <DashboardShell
      user={session.user}
      title={lp.title}
      nav={nav}
      {...i18n.shellProps}
    >
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
      <div className="grid gap-6">
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
              headline={data.profile.headline ?? ""}
              bio={data.profile.bio ?? ""}
              yearsOfExperience={data.profile.yearsOfExperience}
              city={data.profile.city ?? ""}
              education={data.profile.education ?? ""}
              timezone={data.profile.timezone ?? "Asia/Ulaanbaatar"}
              isListed={data.profile.isListed ?? false}
              canRequestListing={canRequestListing}
              copy={formCopy}
            />
          </CardContent>
        </Card>
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
              selectedLanguageIds={selectedLanguages.map((l) => l.languageId)}
              copy={taxonomyCopy}
              locale={locale}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
