import { getSessionUser } from "@/application/common/session";
import { getHomepageSectionImages } from "@/application/actions/homepage.actions";
import { LandingPage } from "@/components/marketing/landing-page";
import { UserRole } from "@/domain/enums";
import {
  getDashboardPath,
  LEGAL_AI_PATH,
} from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function HomePage() {
  const [dict, locale, session, sectionImages] = await Promise.all([
    getDictionary(),
    getLocale(),
    getSessionUser(),
    getHomepageSectionImages(),
  ]);

  const role = session?.user?.role as UserRole | undefined;
  const dashboardHref =
    role && role in UserRole ? getDashboardPath(role) : "/login";
  const authUser = session?.user
    ? {
        displayName:
          session.user.name?.trim() ||
          session.user.email ||
          dict.common.brand,
        dashboardHref,
      }
    : null;

  const composerMode =
    role === UserRole.CLIENT ? "client" : role ? "other" : "guest";
  const exploreHref =
    composerMode === "other" ? dashboardHref : LEGAL_AI_PATH;

  return (
    <LandingPage
      dict={dict}
      locale={locale}
      authUser={authUser}
      composerMode={composerMode}
      exploreHref={exploreHref}
      sectionImages={sectionImages}
    />
  );
}
