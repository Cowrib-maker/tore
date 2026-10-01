import { notFound } from "next/navigation";

import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import type { ActorContext } from "@/application/common/actor-context";
import { requirePageSession } from "@/application/common/session";
import { requireOwnedMatter } from "@/application/use-cases/matters/assert-access";
import { matterRepository } from "@/infrastructure/repositories";
import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";
import { UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { getDashboardPath } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Matter-context Legal AI — reuses LegalAiChat/useLegalAiChatSession's
 * existing streaming, citations, entitlement and document-upload behavior
 * unchanged; the only new behavior is the `matterContext` prop (a visible
 * "Хэрэг: ..." banner) and the matterId sent on the FIRST message of a new
 * conversation (see /api/ai/chat's ownership re-verification). Rendering
 * this page creates nothing and consumes no entitlement — the underlying
 * AIConversation row is created lazily on first send, exactly like every
 * other Legal AI conversation.
 *
 * Deliberately does not use LawyerWorkspaceFrame/LawyerAiWorkbench even for
 * a LAWYER actor (unlike /legal-ai's own role branching) — one Matter-AI
 * code path for every role keeps this V1 slice small. A lawyer's Matter-AI
 * session therefore looks like the citizen LegalAiChat, not their usual
 * workbench; documented here as a known V1 limitation, not an oversight.
 */
export default async function MatterAiPage({
  params,
  searchParams,
}: {
  params: Promise<{ matterId: string }>;
  searchParams: SearchParams;
}) {
  const [{ matterId }, search, dict] = await Promise.all([
    params,
    searchParams,
    getDictionary(),
  ]);
  const session = await requirePageSession();
  const actor: ActorContext = {
    userId: session.user.id,
    role: session.user.role as UserRole,
  };

  let matter;
  try {
    matter = await requireOwnedMatter(actor, matterId, matterRepository);
  } catch (error) {
    if (error instanceof DomainError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
      notFound();
    }
    throw error;
  }

  const conversationId =
    typeof search.conversationId === "string" ? search.conversationId : undefined;

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
  if (conversationId) {
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
      initialAttachedDocuments = await getLegalAiService().getConversationDocumentMetas(
        session.user.id,
        conversationId,
      );
      ownedConversationId = conversationId;
    } catch {
      // Conversation missing or not owned by this user — fall back to empty state.
    }
  }

  const dashboardHref = getDashboardPath(actor.role);

  return (
    <LegalAiChat
      initialConversationId={ownedConversationId}
      initialMessages={initialMessages}
      initialAttachedDocuments={initialAttachedDocuments}
      documentUploadEnabled={
        actor.role === UserRole.CLIENT || actor.role === UserRole.ADMIN
      }
      dashboardHref={dashboardHref}
      displayName={session.user.name?.trim() || session.user.email}
      signInLabel={dict.common.signIn}
      getStartedLabel={dict.common.getStarted}
      dashboardLabel={dict.dashboard.navDashboard}
      matterContext={{ id: matter.id, title: matter.title }}
    />
  );
}
