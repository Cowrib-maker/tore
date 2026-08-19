import { getSessionUser } from "@/application/common/session";
import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
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
  const conversationId =
    typeof params.conversationId === "string" ? params.conversationId : undefined;
  const dashboardHref =
    session?.user?.role &&
    (session.user.role === UserRole.CLIENT ||
      session.user.role === UserRole.LAWYER ||
      session.user.role === UserRole.ADMIN)
      ? getDashboardPath(session.user.role as UserRole)
      : null;

  let initialMessages: { role: "USER" | "ASSISTANT"; content: string }[] = [];
  if (conversationId && session?.user?.id) {
    try {
      const history = await getLegalAiService().getConversationMessages(
        session.user.id,
        conversationId,
      );
      initialMessages = history
        .filter((item) => item.role === "USER" || item.role === "ASSISTANT")
        .map((item) => ({
          role: item.role as "USER" | "ASSISTANT",
          content: item.content,
        }));
    } catch {
      // Conversation missing or not owned by this user — fall back to empty state.
    }
  }

  return (
    <LegalAiChat
      initialQuestion={initialQuestion}
      initialConversationId={initialMessages.length ? conversationId : undefined}
      initialMessages={initialMessages}
      dashboardHref={dashboardHref}
      displayName={session?.user?.name?.trim() || session?.user?.email}
      signInLabel={dict.common.signIn}
      getStartedLabel={dict.common.getStarted}
      dashboardLabel={dict.dashboard.navDashboard}
    />
  );
}
