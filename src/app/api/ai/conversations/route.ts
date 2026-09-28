import { NextResponse } from "next/server";

import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import { requireActor } from "@/application/common/require-actor";
import { DomainError } from "@/domain/errors/domain-error";

const RECENT_CONVERSATIONS_LIMIT = 20;

/**
 * Recent-conversation list for reopening a prior Legal AI thread. Any
 * authenticated, active user (citizen or lawyer) — scoped to their own
 * conversations only via listRecentConversations -> store.userId filter.
 * The lawyer workbench already gets an equivalent list server-rendered via
 * loadLawyerAiWorkbench; this route exists so the citizen chat UI (which
 * has no such server-rendered history today) can fetch the same data
 * client-side without a full page navigation.
 */
export async function GET() {
  try {
    const actor = await requireActor();
    const conversations = await getLegalAiService().listRecentConversations(
      actor.userId,
      RECENT_CONVERSATIONS_LIMIT,
    );
    return NextResponse.json({
      conversations: conversations.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error("Failed to list recent Legal AI conversations:", error);
    return NextResponse.json(
      { error: "Яриануудыг ачаалахад алдаа гарлаа." },
      { status: 500 },
    );
  }
}
