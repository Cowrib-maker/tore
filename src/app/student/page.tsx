import { getSessionUser } from "@/application/common/session";
import { loadPublicDictionary } from "@/application/use-cases/site-content/load-public-dictionary";
import { StudentHubView } from "@/components/student/student-hub-view";
import type { UserRole } from "@/domain/enums";
import { getHomepageAccountHref } from "@/domain/services/homepage-routing";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function StudentHubPage() {
  const locale = await getLocale();
  const [dict, session] = await Promise.all([getDictionary(locale).then((base) => loadPublicDictionary(base, locale)), getSessionUser()]);
  const authUser = session?.user
    ? {
        displayName: session.user.name?.trim() || session.user.email || dict.common.brand,
        dashboardHref: getHomepageAccountHref(session.user.role as UserRole | undefined),
      }
    : null;

  return <StudentHubView dict={dict} locale={locale} authUser={authUser} />;
}
