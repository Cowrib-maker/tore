import { getSessionUser } from "@/application/common/session";
import { getHomepageStats } from "@/application/use-cases/homepage/get-homepage-stats";
import { loadLegalIntelligence } from "@/application/use-cases/homepage/load-legal-intelligence";
import { LandingPage } from "@/components/marketing/landing-page";
import { UserRole } from "@/domain/enums";
import {
  getHomepageAccountHref,
  getHomepageProductHref,
} from "@/domain/services/homepage-routing";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function HomePage() {
  const locale = await getLocale();

  const [dict, session, intelligence, stats] = await Promise.all([
    getDictionary(locale),
    getSessionUser(),
    loadLegalIntelligence(),
    getHomepageStats(),
  ]);

  const role = session?.user?.role as UserRole | undefined;
  const dashboardHref = getHomepageAccountHref(role);
  const authUser = session?.user
    ? {
        displayName:
          session.user.name?.trim() ||
          session.user.email ||
          dict.common.brand,
        dashboardHref,
      }
    : null;

  return (
    <LandingPage
      dict={dict}
      locale={locale}
      authUser={authUser}
      checkoutEnabled={role === UserRole.CLIENT}
      productHrefs={{
        citizen: getHomepageProductHref("citizen", role),
        student: getHomepageProductHref("student", role),
        lawyer: getHomepageProductHref("lawyer", role),
        firm: getHomepageProductHref("firm", role),
        team: getHomepageProductHref("team", role),
      }}
      intelligence={intelligence}
      stats={stats}
    />
  );
}
