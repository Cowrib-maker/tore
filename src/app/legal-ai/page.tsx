import { redirect } from "next/navigation";

import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import { lookupAuthSession } from "@/application/common/session";
import { loadLawyerAiWorkbench } from "@/application/use-cases/ai/load-lawyer-ai-workbench";
import { LawyerWorkspaceFrame } from "@/components/case-review/lawyer-workspace-frame";
import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";
import { LawyerAiWorkbench } from "@/components/legal-ai/lawyer-ai-workbench";
import { UserRole } from "@/domain/enums";
import { sessionReplacedLoginPath } from "@/domain/services/active-session";
import { getDashboardPath, getProfilePath } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegalAiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [dict, lookup, params] = await Promise.all([
    getDictionary(),
    lookupAuthSession(),
    searchParams,
  ]);
  if (lookup.replaced) {
    redirect(sessionReplacedLoginPath());
  }
  const session = lookup.session;
  const initialQuestion = typeof params.q === "string" ? params.q : "";
  const conversationId =
    typeof params.conversationId === "string" ? params.conversationId : undefined;
  const caseFileId =
    typeof params.caseId === "string" && params.caseId.trim()
      ? params.caseId.trim()
      : undefined;
  const dashboardHref =
    session?.user?.role &&
    (session.user.role === UserRole.CLIENT ||
      session.user.role === UserRole.LAWYER ||
      session.user.role === UserRole.ADMIN)
      ? getDashboardPath(session.user.role as UserRole)
      : null;

  let initialMessages: { role: "USER" | "ASSISTANT"; content: string }[] = [];
  let initialAttachedDocuments: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    extractStatus: "OK" | "EMPTY" | "FAILED" | "NEEDS_OCR";
    pageCount: number | null;
  }[] = [];
  let ownedConversationId: string | undefined;
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
      initialAttachedDocuments =
        await getLegalAiService().getConversationDocumentMetas(
          session.user.id,
          conversationId,
        );
      ownedConversationId = conversationId;
    } catch {
      // Conversation missing or not owned by this user — fall back to empty state.
    }
  }

  if (session?.user?.role === UserRole.LAWYER) {
    const actor = {
      userId: session.user.id,
      role: UserRole.LAWYER,
    };
    const workbench = await loadLawyerAiWorkbench(actor, {
      conversationId: ownedConversationId,
      caseId: caseFileId,
    });
    const i18n = await getShellI18n("lawyer");
    return (
      <LawyerWorkspaceFrame
        variant="workbench"
        user={session.user}
        profileHref={getProfilePath(UserRole.LAWYER) || "/lawyer/profile"}
        locale={i18n.locale}
        languageLabel={i18n.shellProps.languageLabel}
        signOutLabel={i18n.shellProps.signOutLabel}
      >
        <LawyerAiWorkbench
          key={
            workbench.conversationId ??
            `new-${workbench.caseFileId ?? "unattached"}`
          }
          initialConversationId={workbench.conversationId}
          initialCaseFileId={workbench.caseFileId}
          initialMessages={initialMessages}
          initialAttachedDocuments={initialAttachedDocuments}
          caseContext={workbench.caseContext}
          history={workbench.history}
        />
      </LawyerWorkspaceFrame>
    );
  }

  return (
    <LegalAiChat
      initialQuestion={initialQuestion}
      initialConversationId={ownedConversationId}
      initialMessages={initialMessages}
      initialAttachedDocuments={initialAttachedDocuments}
      documentUploadEnabled={session?.user?.role === UserRole.LAWYER}
      dashboardHref={dashboardHref}
      displayName={session?.user?.name?.trim() || session?.user?.email}
      signInLabel={dict.common.signIn}
      getStartedLabel={dict.common.getStarted}
      dashboardLabel={dict.dashboard.navDashboard}
    />
  );
}
