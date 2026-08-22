import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import { guardLawyerAiHttp, recordLawyerFeatureUsage } from "@/application/common/guard-lawyer-ai-http";
import { requireActor } from "@/application/common/require-actor";
import { DomainError } from "@/domain/errors/domain-error";
import { EntitlementFeature, UserRole } from "@/domain/enums";

type ChatRequest = {
  message?: string;
  conversationId?: string;
  mode?: "CITIZEN" | "PROFESSIONAL";
};

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    let usageId: string | undefined;

    if (actor.role === UserRole.LAWYER) {
      const guard = await guardLawyerAiHttp(
        actor,
        EntitlementFeature.LEGAL_AI_QUERY,
      );
      usageId = guard.usageId;
    }

    const body = (await request.json()) as ChatRequest;
    const result = await getLegalAiService().createTurn({
      userId: actor.userId,
      message: body.message ?? "",
      conversationId: body.conversationId,
      userContext: {
        role: actor.role,
      },
      mode: body.mode,
    });

    if (usageId) {
      await recordLawyerFeatureUsage(usageId, EntitlementFeature.LEGAL_AI_QUERY, {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    }

    return NextResponse.json({
      conversationId: result.conversationId,
      message: {
        id: result.message.id,
        role: result.message.role,
        content: result.message.content,
      },
    });
  } catch (error) {
    if (error instanceof LegalAiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof DomainError) {
      const status =
        error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error("TORE Legal AI error:", error);

    return NextResponse.json(
      {
        error: "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      },
      { status: 500 },
    );
  }
}
