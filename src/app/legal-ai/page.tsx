import { getSessionUser } from "@/application/common/session";
import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegalAiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [dict, session, params] = await Promise.all([
    getDictionary(),
    getSessionUser(),
    searchParams,
  ]);
  const initialQuestion = typeof params.q === "string" ? params.q : "";
  const dashboardHref =
    session?.user?.role &&
    (session.user.role === UserRole.CLIENT ||
      session.user.role === UserRole.LAWYER ||
      session.user.role === UserRole.ADMIN)
      ? getDashboardPath(session.user.role as UserRole)
      : null;

  return (
    <LegalAiChat
      initialQuestion={initialQuestion}
      dashboardHref={dashboardHref}
      displayName={session?.user?.name?.trim() || session?.user?.email}
      signInLabel={dict.common.signIn}
      getStartedLabel={dict.common.getStarted}
      dashboardLabel={dict.dashboard.navDashboard}
    />
  );
}
